import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatSlideToggle, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MatStepper } from '@angular/material/stepper';
import html2canvas from 'html2canvas';
import { p2tHttpService } from '../Services/p2tHttpService';
import { t2pHttpService } from '../Services/t2pHttpService';
import { SpinnerService } from '../utilities/SpinnerService';
import { ModelDisplayer } from '../utilities/modelDisplayer';

declare global {
  interface Window {
    fileContent: string;
    dropfileContent: string;
  }
}

@Component({
  selector: 'app-components',
  templateUrl: './components.html',
  styleUrls: ['./components.css'],
})
export class CombinedComponent implements OnInit {

  // ─── Tool selection ───────────────────────────────────────────────────────
  selectedTool: 't2p' | 'p2t' | null = null;

  // ─── Shared LLM config (Step 1) ───────────────────────────────────────────
  isLLMEnabled = false;
  selectedLLMProvider = 'openai';
  apiKey = '';
  apiKeyValid: boolean | null = null;
  apiKeyChecking = false;

  // ─── T2P state ────────────────────────────────────────────────────────────
  protected text = '';
  protected selectedDiagram = 'bpmn';
  protected textResult = '';
  protected responseText = '';
  protected promptingStrategy = 'few_shot';
  protected isFiledDropped = false;
  protected droppedFileName = '';

  // ─── P2T state ────────────────────────────────────────────────────────────
  response: any;
  fileType: string;
  isFileDropped = false;
  droppedFileNameP2T = '';
  showPromptInput = false;
  useRag = false;
  prompt = `Create a clearly structured and comprehensible continuous text from the given BPMN that is understandable for an uninformed reader. The text should be easy to read in the summary and contain all important content; if there are subdivided points, these are integrated into the text with suitable sentence beginnings in order to obtain a well-structured and easy-to-read text. Under no circumstances should the output contain sub-items or paragraphs, but should cover all processes in one piece!`;
  isPromptReadonly = true;
  models: string[] = [];
  selectedModel: string;
  error: string;
  hasPromptWarningShown = false;
  isApiKeyEntered = false;

  // ─── ViewChild refs ───────────────────────────────────────────────────────
  @ViewChild('stepper') stepper!: MatStepper;
  @ViewChild('t2pFileInputRef') t2pFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKeyInput') apiKeyInput!: ElementRef;
   @ViewChild('fileInputRef') p2tFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('llmToggle') llmToggle!: MatSlideToggle;

  constructor(
    private p2tHttpService: p2tHttpService,
    private t2pHttpService: t2pHttpService,
    public spinnerService: SpinnerService
  ) {}

  ngOnInit(): void {}

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 – LLM Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  async validateApiKey(): Promise<void> {
    if (!this.apiKey) return;
    this.apiKeyChecking = true;
    this.apiKeyValid = null;

    try {
      if (this.selectedLLMProvider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        this.apiKeyValid = response.ok;
      } else if (this.selectedLLMProvider === 'gemini') {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
        );
        this.apiKeyValid = response.ok;
      }
    } catch {
      this.apiKeyValid = false;
    }

    this.apiKeyChecking = false;

    if (this.apiKeyValid) {
      this.isApiKeyEntered = true;
      this.fetchModelsForProvider(this.selectedLLMProvider);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // T2P – Steps 3-5
  // ═══════════════════════════════════════════════════════════════════════════

  protected generateProcess(inputText: string): void {
    document.getElementById('error-container-text')!.style.display = 'none';
    this.spinnerService.show();
    const text = this.replaceUmlaut(inputText);

    if (this.isLLMEnabled) {
      this.t2pHttpService.postT2PWithLLM(
        text,
        this.apiKey,
        this.promptingStrategy,
        this.selectedDiagram,
        this.selectedLLMProvider,
        (response: any) => {
          this.responseText = JSON.stringify(response, null, 2);
          this.setTextResult(text);
        }
      );
    } else {
      if (this.selectedDiagram === 'bpmn') {
        this.t2pHttpService.postT2PBPMN(text);
      }
      if (this.selectedDiagram === 'petri-net') {
        this.t2pHttpService.postT2PPetriNet(text);
      }
      this.setTextResult(text);
    }
  }

  protected onSelectedDiagram(event: any): void {
    if (event.target?.value) {
      this.selectedDiagram = event.target.value;
    }
  }

  protected onDownloadText(): void {
    this.t2pHttpService.downloadModelAsText();
  }

  onDownloadImage(): void {
    const element = document.getElementById('model-container')!;
    html2canvas(element).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = 't2p.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.processT2PFiles(files);
      this.isFiledDropped = true;
      this.droppedFileName = files[0].name;
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected selectT2PFiles(): void {
    this.t2pFileInputRef.nativeElement.click();
  }

  protected onT2PFileSelected(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files?.length) {
      this.processT2PFiles(files);
      this.isFiledDropped = true;
      this.droppedFileName = files[0].name;
    }
  }

   processT2PFiles(files: FileList): void {
     for (let i = 0; i < files.length; i++) {
       const file = files[i];
       
       // Validate file type - only allow .txt files
       if (file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase() !== 'txt') {
         alert('Please upload only .txt files');
         return;
       }
       
       const reader = new FileReader();
       reader.onload = () => {
         window.dropfileContent = reader.result as string;
         this.text = window.dropfileContent;
       };
       reader.readAsText(file);
     }
   }

  protected setTextResult(text: string): void {
    this.textResult = text;
  }

  protected replaceUmlaut(text: string): string {
    return text
      .replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')
      .replace('ß', 'ss').replace('Ä', 'Ae').replace('Ö', 'Oe').replace('Ü', 'Ue');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P2T – Steps 3-4
  // ═══════════════════════════════════════════════════════════════════════════

  fetchModelsForProvider(provider: string): void {
    const key = provider === 'lmstudio' ? null : this.apiKey;
    this.p2tHttpService.getModels(key, provider).subscribe((models) => {
      this.models = models;
      if (models.length) this.selectedModel = models[0];
    });
  }

  onModelChange(model: string): void {
    this.selectedModel = model;
  }

  onRagToggleChange(event: MatSlideToggleChange): void {
    this.useRag = event.checked;
  }

  generateText(): void {
    if (this.fileType === 'bpmn') {
      ModelDisplayer.displayBPMNModel(window.dropfileContent);
    } else if (this.fileType === 'pnml') {
      ModelDisplayer.generatePetriNet(window.dropfileContent);
    }

    if (window.fileContent !== undefined || window.dropfileContent !== undefined) {
      this.spinnerService.show();

      if (this.isLLMEnabled) {
        this.p2tHttpService
          .postP2TLLM(
            window.dropfileContent,
            this.apiKey,
            this.prompt,
            this.selectedModel,
            this.selectedLLMProvider,
            this.useRag
          )
          .subscribe({
            next: (response: any) => {
              this.spinnerService.hide();
              this.displayText(response);
            },
            error: (err: any) => {
              this.spinnerService.hide();
              this.error = err;
            },
          });
      } else {
        this.p2tHttpService.postP2T(window.dropfileContent).subscribe({
          next: (response: any) => {
            this.spinnerService.hide();
            this.displayText(response);
          },
          error: (err: any) => {
            this.spinnerService.hide();
            this.error = err;
          },
        });
      }
    } else {
      this.displayText('No files uploaded');
    }

    this.stepper.next();
  }

  editPrompt(): void {
    if (!this.hasPromptWarningShown) {
      if (confirm('Warning: Changes to the prompt are at your own risk. Would you like to continue?')) {
        this.isPromptReadonly = false;
        this.hasPromptWarningShown = true;
      }
    } else {
      this.isPromptReadonly = false;
    }
  }

  isGenerateButtonDisabled(): boolean {
    return !this.isFileDropped;
  }

  downloadText(): void {
    const text = this.response;
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
    );
    element.setAttribute('download', 'p2t.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  onP2TDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.isFileDropped = true;
      this.droppedFileNameP2T = files[0].name;
      this.processP2TFiles(files);
    }
  }

  onP2TDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  selectP2TFiles(): void {
    this.p2tFileInputRef.nativeElement.click();
  }

  onP2TFileSelected(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files?.length) {
      this.isFileDropped = true;
      this.droppedFileNameP2T = files[0].name;
      this.processP2TFiles(files);
    }
  }

   processP2TFiles(files: FileList): void {
     for (let i = 0; i < files.length; i++) {
       const file = files[i];
       const fileType = this.getFileType(file.name);
       
       // Validate file type
       if (fileType !== 'bpmn' && fileType !== 'pnml') {
         alert('Please upload only .bpmn or .pnml files');
         return;
       }
       
       const reader = new FileReader();
       reader.onload = () => {
         window.dropfileContent = reader.result as string;
         this.fileType = fileType;
         this.displayModel();
       };
       reader.readAsText(file);
     }
   }

  getFileType(fileName: string): string {
    const ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
    if (ext === 'pnml') return 'pnml';
    if (ext === 'bpmn') return 'bpmn';
    return '';
  }

  private displayModel(): void {
    if (this.fileType === 'bpmn') {
      ModelDisplayer.displayBPMNModel(window.dropfileContent);
    } else if (this.fileType === 'pnml') {
      ModelDisplayer.generatePetriNet(window.dropfileContent);
    }
  }

  private displayText(response: string): void {
    this.response = this.p2tHttpService.formText(response);
    const container = document.getElementById('result')!;
    const paragraph = document.createElement('p');
    paragraph.textContent = this.response;
    if (container.firstChild) container.firstChild.remove();
    container.appendChild(paragraph);
  }
}