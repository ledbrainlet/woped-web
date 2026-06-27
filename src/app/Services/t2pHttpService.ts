import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SpinnerService } from '../utilities/SpinnerService';
import { ModelDisplayer } from '../utilities/modelDisplayer';
import { TransformerService } from './transformerService';

const httpOptions = {
  headers: new HttpHeaders({
    'Content-Type': 'application/json',
  }),
  responseType: 'text' as 'json', // API returns text, not JSON
};

@Injectable({
  providedIn: 'root',
})
export class t2pHttpService {
  private urlBPMN = 'https://woped.dhbw-karlsruhe.de/t2p-2.0/generate_BPMN';
  private urlPetriNet = 'https://woped.dhbw-karlsruhe.de/t2p-2.0/generate_PNML';

  private plainDocumentForDownload: string;

  constructor(
    private t2phttpClient: HttpClient,
    public spinnerService: SpinnerService,
    private transformerService: TransformerService
  ) { }
  //Makes the HTTP request and returns the HTTP response for the BPMN model. Triggers the display of the model at the same time.
  public postT2PBPMN(text: string) {
    //Reset Model Container Div, so that only valid/current model will be displayed.
    const modelContainer = document.getElementById('model-container');
    if (modelContainer) modelContainer.innerHTML = '';
    return this.t2phttpClient
      .post<string>(this.urlBPMN, text, httpOptions)
      .subscribe(
        (response: any) => {
          this.spinnerService.hide();

          // Call Method to Display the BPMN Model.
          ModelDisplayer.displayBPMNModel(response);
          this.plainDocumentForDownload = response;
        },
        (error: any) => {
          console.log(error);
          // Error Handling User Feedback
          this.spinnerService.hide();
          document.getElementById('error-container-text')!.innerHTML =
            error.status + ' ' + error.statusText + ' ' + error.error;
          document.getElementById('error-container-text')!.style.display =
            'block';
        }
      );
  }

  //Enables the download of a text file in which the diagram is displayed as a .pnml or .bpmn file. ???
  public downloadModelAsText(filename = 't2p.pnml') {
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(this.plainDocumentForDownload)
    );
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();
    document.body.removeChild(element);
  }
  //Makes the HTTP request and returns the HTTP response for the  Petri net. Triggers the display of the model at the same time.
  //The Petri net is displayed in the same way as the BPMN model.
  public postT2PPetriNet(text: string) {
    const petriContainer = document.getElementById('petri-render-container');
    if (petriContainer) petriContainer.innerHTML = '';
    return this.t2phttpClient
      .post<string>(this.urlPetriNet, text, httpOptions)
      .subscribe(
        (response: any) => {
          this.spinnerService.hide();
          ModelDisplayer.generatePetriNet(response, 'petri-render-container');
          this.plainDocumentForDownload = response;
        },
        (error: any) => {
          this.spinnerService.hide();
          // Error Handling User Feedback
          document.getElementById('error-container-text')!.innerHTML =
            error.status + ' ' + error.statusText + ' ' + error.error;
          document.getElementById('error-container-text')!.style.display =
            'block';
        }
      );
  }
  public postT2PWithLLM(
    text: string,
    apiKey: string,
    approach: string,
    modelType: string,
    llmProvider: string,
    callback: (response: any) => void,
    model?: string
  ) {
    // Determine the appropriate URL based on the modelType
    let llmUrl: string;
    console.log('Approach value:', approach);
    console.log('Model type:', modelType);

    if (modelType.toLowerCase().includes('bpmn') || modelType === 'bpmn') {
      llmUrl = this.urlBPMN;
      console.log('Using BPMN URL:', llmUrl);
    } else if (modelType.toLowerCase().includes('petri') || modelType.toLowerCase().includes('pnml') || modelType === 'petri') {
      llmUrl = this.urlBPMN; // LLM generates BPMN; we convert to PNML afterwards via transformer
      console.log('Using BPMN URL for Petri-Net (LLM path):', llmUrl);
    } else {
      console.error('Unknown model type:', modelType);
      this.spinnerService.hide();
      document.getElementById('error-container-text')!.innerHTML = 'Unknown model type: ' + modelType;
      document.getElementById('error-container-text')!.style.display = 'block';
      return;
    }

    const body: any = {
      text: text,
      api_key: apiKey,
      approach: approach,
      llm_provider: llmProvider,
    };
    if (model) {
      body.model = model.startsWith('models/') ? model.slice('models/'.length) : model;
    }
    const modelContainer = document.getElementById('model-container');
    if (modelContainer) modelContainer.innerHTML = '';
    const petriContainer = document.getElementById('petri-render-container');
    if (petriContainer) petriContainer.innerHTML = '';

    const handleSuccess = (response: any) => {
      this.spinnerService.hide();
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response);
      } catch (e) {
        parsedResponse = { result: response };
      }
      const xmlContent = parsedResponse.result || parsedResponse;
      this.plainDocumentForDownload = xmlContent;

      if (modelType.toLowerCase().includes('bpmn') || modelType === 'bpmn') {
        ModelDisplayer.displayBPMNModel(xmlContent);
        callback(parsedResponse);
      } else if (modelType.toLowerCase().includes('petri') || modelType.toLowerCase().includes('pnml') || modelType === 'petri') {
        this.transformerService.bpmnToPnml(xmlContent).subscribe({
          next: (pnml: string) => {
            this.plainDocumentForDownload = pnml;
            ModelDisplayer.generatePetriNet(pnml, 'petri-render-container');
            callback(parsedResponse);
          },
          error: (err: any) => {
            this.spinnerService.hide();
            const errorEl = document.getElementById('error-container-text');
            if (errorEl) {
              errorEl.innerHTML = 'BPMN→PNML Transformation fehlgeschlagen: ' + err.status;
              errorEl.style.display = 'block';
            }
          }
        });
      }
    };

    const handleError = (error: any, attempt: number) => {
      if (error.status === 500 && attempt < 3) {
        // Retry up to 3 times on 500 — LLM responses are non-deterministic
        this.t2phttpClient.post<string>(llmUrl, body, httpOptions).subscribe(
          (response: any) => handleSuccess(response),
          (retryError: any) => handleError(retryError, attempt + 1)
        );
      } else {
        this.spinnerService.hide();
        document.getElementById('error-container-text')!.innerHTML =
          error.status + ' ' + error.statusText + ' ' + error.error;
        document.getElementById('error-container-text')!.style.display = 'block';
      }
    };

    return this.t2phttpClient.post<string>(llmUrl, body, httpOptions).subscribe(
      (response: any) => handleSuccess(response),
      (error: any) => handleError(error, 0)
    );
  }
}
