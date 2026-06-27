import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Operator types supported by the transformer (WorkflowBranchingType enum)
const SUPPORTED_OPERATOR_TYPES = new Set([101, 102, 104, 105, 106, 107, 108, 109]);

/**
 * Strips WoPeD PNML content that the transformer's pydantic-xml parser rejects:
 * - Operator elements with unsupported type values (e.g. 103 = OR-split)
 * - Arc inscriptions missing a <graphics> child (pydantic field is required)
 */
function normalizePnmlForTransformer(pnml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(pnml, 'application/xml');

  // Remove operators with unsupported type values
  doc.querySelectorAll('transition toolspecific operator').forEach(op => {
    const type = parseInt(op.getAttribute('type') ?? '0', 10);
    if (!SUPPORTED_OPERATOR_TYPES.has(type)) {
      op.parentElement?.removeChild(op);
    }
  });

  // Arc inscriptions need a <graphics> child or the parser throws
  doc.querySelectorAll('arc inscription').forEach(inscription => {
    if (!inscription.querySelector('graphics')) {
      const graphics = doc.createElement('graphics');
      const offset = doc.createElement('offset');
      offset.setAttribute('x', '0');
      offset.setAttribute('y', '0');
      graphics.appendChild(offset);
      inscription.appendChild(graphics);
    }
  });

  return new XMLSerializer().serializeToString(doc);
}

@Injectable({
  providedIn: 'root',
})
export class TransformerService {
  private baseUrl = 'https://woped.dhbw-karlsruhe.de/pnml-bpmn-transformer';

  constructor(private http: HttpClient) {}

  pnmlToBpmn(pnml: string): Observable<string> {
    const formData = new FormData();
    formData.append('pnml', normalizePnmlForTransformer(pnml));
    return this.http.post<{ bpmn: string }>(
      `${this.baseUrl}/transform?direction=pnmltobpmn`,
      formData
    ).pipe(map(response => response.bpmn));
  }

  bpmnToPnml(bpmn: string): Observable<string> {
    const formData = new FormData();
    formData.append('bpmn', bpmn);
    return this.http.post<{ pnml: string }>(
      `${this.baseUrl}/transform?direction=bpmntopnml`,
      formData
    ).pipe(map(response => response.pnml));
  }
}
