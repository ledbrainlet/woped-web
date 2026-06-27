import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { TranslocoService } from '@ngneat/transloco';
import html2canvas from 'html2canvas';
import { p2tHttpService } from '../Services/p2tHttpService';
import { t2pHttpService } from '../Services/t2pHttpService';
import { TransformerService } from '../Services/transformerService';
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
export class CombinedComponent {

  // ─── Tool selection ───────────────────────────────────────────────────────
  selectedTool: 't2p' | 'p2t' | null = null;

  // ─── Shared LLM config (Step 1) ───────────────────────────────────────────
  isLLMEnabled = true;
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
  modelFallbackWarning: string = '';
  hasPromptWarningShown = false;
  isApiKeyEntered = false;

  // ─── ViewChild refs ───────────────────────────────────────────────────────
  @ViewChild('stepper') stepper!: MatStepper;
  @ViewChild('t2pFileInputRef') t2pFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKeyInput') apiKeyInput!: ElementRef;
   @ViewChild('fileInputRef') p2tFileInputRef!: ElementRef<HTMLInputElement>;


  constructor(
    private p2tHttpService: p2tHttpService,
    private t2pHttpService: t2pHttpService,
    private transformerService: TransformerService,
    public spinnerService: SpinnerService,
    public translocoService: TranslocoService
  ) {}

  setLanguage(lang: string): void {
    this.translocoService.setActiveLang(lang);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 – LLM Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  async validateApiKey(): Promise<void> {
    this.apiKey = this.apiKey.trim();
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

  protected generateProcess(): void {
    document.getElementById('error-container-text')!.style.display = 'none';
    const text = this.replaceUmlaut(this.text.trim());

    if (!text) {
      this.setErrorMessage('Please enter a process description first.');
      return;
    }

    this.spinnerService.show();

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
        },
        this.selectedModel
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

  protected onDownloadText(): void {
    const filename = this.selectedDiagram === 'bpmn' ? 't2p.bpmn' : 't2p.pnml';
    this.t2pHttpService.downloadModelAsText(filename);
  }

  onDownloadImage(): void {
    const link = document.createElement('a');
    link.download = 't2p.png';

    if (this.selectedDiagram === 'petri-net') {
      const dataUrl = ModelDisplayer.lastPetriNetDataUrl;
      if (!dataUrl) return;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const element = document.getElementById('model-container')!;
      html2canvas(element).then((canvas) => {
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
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

  private setErrorMessage(message: string): void {
    const errorContainer = document.getElementById('error-container-text');
    if (!errorContainer) return;

    this.spinnerService.hide();
    errorContainer.innerHTML = message;
    errorContainer.style.display = 'block';
  }

  fetchModelsForProvider(provider: string): void {
    const key = provider === 'lmstudio' ? '' : this.apiKey;
    this.p2tHttpService.getModels(key, provider).subscribe({
      next: (models) => {
        const excluded = [
          'instruct', 'embedding', 'whisper', 'tts', 'davinci', 'babbage',
          'moderation', 'transcribe', 'image', 'sora', 'audio', 'realtime',
          'search-preview', 'deep-research', 'diarize', 'codex', 'translate'
        ];
        this.models = models.filter(m =>
          !excluded.some(ex => m.toLowerCase().includes(ex))
        );
        const preferred = this.models.find(m => m === 'gpt-4');
        this.selectedModel = preferred ?? this.models[0];
      },
      error: () => {
        const fallbacks: Record<string, string> = {
          openai: 'gpt-4o',
          gemini: 'models/gemini-2.5-flash',
          lmstudio: 'local-model',
        };
        this.selectedModel = fallbacks[this.selectedLLMProvider] ?? 'gpt-4o';
        this.models = [this.selectedModel];
        this.modelFallbackWarning = `Model list unavailable — using default: ${this.selectedModel}`;
      }
    });
  }

  onModelChange(model: string): void {
    this.selectedModel = model;
  }

  // onRagToggleChange(event: MatSlideToggleChange): void {
  //   this.useRag = event.checked;
  // }

  generateText(): void {
    if (this.fileType === 'bpmn') {
      ModelDisplayer.displayBPMNModel(window.dropfileContent);
    }

    if (window.fileContent !== undefined || window.dropfileContent !== undefined) {
      this.spinnerService.show();

      // PNML: erst PNML→BPMN via Transformer, dann LLM-Endpunkt
      if (this.fileType === 'pnml') {
        this.transformerService.pnmlToBpmn(window.dropfileContent).subscribe({
          next: (bpmn: string) => {
            this.postLLMWithFallback(bpmn);
          },
          error: (err: any) => {
            console.error('[Transformer] Status:', err.status, '| Body:', err.error);
            this.spinnerService.hide();
            this.error = 'PNML→BPMN Transformation fehlgeschlagen: ' + (err.status ?? err);
          },
        });
        return;
      }

      if (this.isLLMEnabled) {
        this.modelFallbackWarning = '';
        this.postLLMWithFallback(window.dropfileContent);
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

  private postLLMWithFallback(content: string): void {
    const fallbackModel = this.selectedLLMProvider === 'gemini' ? 'models/gemini-2.0-flash' : 'gpt-4o';

    this.p2tHttpService.postP2TLLM(
      content, this.apiKey, this.prompt, this.selectedModel, this.selectedLLMProvider, this.useRag
    ).subscribe({
      next: (response: any) => {
        this.spinnerService.hide();
        this.displayText(response);
      },
      error: (err: any) => {
        const isServerError = typeof err === 'string' && err.includes('500');
        if (isServerError && this.selectedModel !== fallbackModel) {
          const failedModel = this.selectedModel;
          this.selectedModel = fallbackModel;
          this.modelFallbackWarning = `Model "${failedModel}" not supported by backend. Retrying with ${fallbackModel}…`;
          this.p2tHttpService.postP2TLLM(
            content, this.apiKey, this.prompt, this.selectedModel, this.selectedLLMProvider, this.useRag
          ).subscribe({
            next: (response: any) => {
              this.spinnerService.hide();
              this.modelFallbackWarning = `Model "${failedModel}" not supported. Used ${fallbackModel} instead.`;
              this.displayText(response);
            },
            error: (retryErr: any) => {
              this.spinnerService.hide();
              this.error = retryErr;
            },
          });
        } else {
          this.spinnerService.hide();
          this.error = err;
        }
      },
    });
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
    if (!this.isFileDropped) return true;
    if (!this.selectedModel) return true;
    return false;
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
         setTimeout(() => this.displayModel(), 0);
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
    }
    // PNML has no visual preview in P2T — transformer converts it on generate
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
