import * as vis from 'vis';
import * as BpmnJS from 'bpmn-js/dist/bpmn-modeler.production.min.js';

interface PetriPlace {
  id: string | null;
  label: string | null;
}

interface PetriTransition {
  id: string | null;
  label: string | null;
  isGateway: boolean;
  gatewayType?: string | null;
  gatewayID?: string | null;
}

interface PetriArc {
  id: string | null;
  source: string | null;
  target: string | null;
}

interface PetriNet {
  places: PetriPlace[];
  transitions: PetriTransition[];
  arcs: PetriArc[];
}

interface GatewayLog {
  gatewayID: string | null | undefined;
  transitionIDs: { transitionID: string | null }[];
}

interface GatewayReplacement {
  source: string | null | undefined;
  target: string | null | undefined;
}

interface BpmnCanvas {
  resized(): void;
  zoom(value: string): void;
}

interface BpmnViewer {
  importXML(xml: string): Promise<unknown>;
  get(service: 'canvas'): BpmnCanvas;
}

interface BpmnBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BpmnElementLayout {
  id: string;
  kind: string;
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BpmnSequenceFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
}

// Model Display Class
export class ModelDisplayer {
  private static readonly bpmnElementNames = new Set([
    'startEvent',
    'endEvent',
    'intermediateCatchEvent',
    'intermediateThrowEvent',
    'boundaryEvent',
    'task',
    'userTask',
    'serviceTask',
    'manualTask',
    'scriptTask',
    'businessRuleTask',
    'sendTask',
    'receiveTask',
    'exclusiveGateway',
    'parallelGateway',
    'inclusiveGateway',
    'eventBasedGateway',
    'subProcess',
    'callActivity',
  ]);

  // Preprocessing of the Petri net model. The model is converted into a format (domparser) that can be displayed by the library.
  public static async generatePetriNet(modelAsPetriNet: string) {
    try {
      const domparser = new DOMParser();
      const xmlDoc = domparser.parseFromString(modelAsPetriNet, 'text/xml');
      ModelDisplayer.displayPNMLModel(xmlDoc);
    } catch (err) {
      console.log(err);
    }
  }

  // Displays the BPMN model. Sets the representation in the HTML element "model-container".
  public static displayPNMLModel(petrinet: Document) {
    const generateWorkFlowNet = Boolean(false); //Determines wether WoPeD specific Elements like XOR Split are created
    const prettyPetriNet = getPetriNet(petrinet);
    let gateways: GatewayLog[] = [];

    generatePetrinetConfig(prettyPetriNet);
    function generatePetrinetConfig(petrinet: PetriNet) {
      const data = getVisElements(petrinet);

      // create a network
      const container = document.getElementById('model-container');

      const options = {
        layout: {
          randomSeed: undefined,
          improvedLayout: true,
          hierarchical: {
            enabled: true,
            levelSeparation: 150,
            nodeSpacing: 100,
            treeSpacing: 200,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
            direction: 'LR', // UD, DU, LR, RL
            sortMethod: 'directed', // hubsize, directed
          },
        },
        groups: {
          places: {
            color: { background: '#4DB6AC', border: '#00695C' },
            borderWidth: 3,
            shape: 'circle',
          },
          transitions: {
            color: { background: '#FFB74D', border: '#FB8C00' },
            shape: 'square',
            borderWidth: 3,
          },
          andJoin: {
            color: { background: '#DCE775', border: '#9E9D24' },
            shape: 'square',
            borderWidth: 3,
          },
          andSplit: {
            color: { background: '#DCE775', border: '#9E9D24' },
            shape: 'square',
            borderWidth: 3,
          },
          xorSplit: {
            color: { background: '#9575CD', border: '#512DA8' },
            shape: 'square',
            borderWidth: 3,
            image: '/img/and_split.svg',
          },
          xorJoin: {
            color: { background: '#9575CD', border: '#512DA8' },
            shape: 'square',
            borderWidth: 3,
          },
        },
        interaction: {
          zoomView: true,
          dragView: true,
        },
      };
      // initialize your network!
      new vis.Network(container, data, options);
    }

    function getPetriNet(PNML: Document): PetriNet {
      const places = PNML.getElementsByTagName('place');
      const transitions = PNML.getElementsByTagName('transition');
      const arcs = PNML.getElementsByTagName('arc');

      const petrinet = {
        places: [],
        transitions: [],
        arcs: [],
      };

      for (let x = 0; x < arcs.length; x++) {
        const arc = arcs[x];
        petrinet.arcs.push({
          id: arc.getAttribute('id'),
          source: arc.getAttribute('source'),
          target: arc.getAttribute('target'),
        });
      }

      for (let x = 0; x < places.length; x++) {
        const place = places[x];
        petrinet.places.push({
          id: place.getAttribute('id'),
          label: place.getElementsByTagName('text')[0].textContent,
        });
      }

      for (let x = 0; x < transitions.length; x++) {
        const transition = transitions[x];
        const isGateway =
          transition.getElementsByTagName('operator').length > 0;
        let gatewayType = undefined;
        let gatewayID = undefined;
        if (isGateway) {
          gatewayType = transition
            .getElementsByTagName('operator')[0]
            .getAttribute('type');
          gatewayID = transition
            .getElementsByTagName('operator')[0]
            .getAttribute('id');
        }
        petrinet.transitions.push({
          id: transition.getAttribute('id'),
          label: transition.getElementsByTagName('text')[0].textContent,
          isGateway: isGateway,
          gatewayType: gatewayType,
          gatewayID: gatewayID,
        });
      }
      return petrinet;
    }

    function resetGatewayLog(): void {
      gateways = [];
    }

    function logContainsGateway(transition: PetriTransition): boolean {
      for (let x = 0; x < gateways.length; x++) {
        if (gateways[x].gatewayID === transition.gatewayID) return true;
      }
      return false;
    }
    // Identifies the Gateways
    function logGatewayTransition(transition: PetriTransition): void {
      if (logContainsGateway(transition) === true) {
        for (let x = 0; x < gateways.length; x++) {
          if (gateways[x].gatewayID === transition.gatewayID)
            gateways[x].transitionIDs.push({ transitionID: transition.id });
        }
      } else {
        gateways.push({
          gatewayID: transition.gatewayID,
          transitionIDs: [{ transitionID: transition.id }],
        });
      }
    }

    function getGatewayIDsforReplacement(arc: PetriArc): GatewayReplacement {
      const replacement = { source: null, target: null };
      for (let x = 0; x < gateways.length; x++) {
        for (let i = 0; i < gateways[x].transitionIDs.length; i++) {
          if (arc.source === gateways[x].transitionIDs[i].transitionID) {
            replacement.source = gateways[x].gatewayID;
          }
          if (arc.target === gateways[x].transitionIDs[i].transitionID) {
            replacement.target = gateways[x].gatewayID;
          }
        }
      }
      return replacement;
    }

    function replaceGatewayArcs(arcs: PetriArc[]): void {
      for (let x = 0; x < arcs.length; x++) {
        const replacement = getGatewayIDsforReplacement(arcs[x]);
        if (replacement.source !== null) {
          arcs[x].source = replacement.source;
        }
        if (replacement.target !== null) {
          arcs[x].target = replacement.target;
        }
      }
    }

    function getVisElements(PetriNet: PetriNet) {
      // provide the data in the vis format
      const edges = new vis.DataSet([]);
      const nodes = new vis.DataSet([]);
      for (let x = 0; x < PetriNet.places.length; x++) {
        nodes.add({
          id: PetriNet.places[x].id,
          group: 'places',
          label: PetriNet.places[x].label,
        });
      }

      for (let x = 0; x < PetriNet.transitions.length; x++) {
        if (
          !PetriNet.transitions[x].isGateway ||
          generateWorkFlowNet === false
        ) {
          nodes.add({
            id: PetriNet.transitions[x].id,
            group: 'transitions',
            label: PetriNet.transitions[x].id,
            title: PetriNet.transitions[x].label,
          });
        } else {
          let gatewayGroup = '';
          const label = '';
          switch (PetriNet.transitions[x].gatewayType) {
            case '101':
              gatewayGroup = 'andSplit';
              break;
            case '102':
              gatewayGroup = 'andJoin';
              break;
            case '104':
              gatewayGroup = 'xorSplit';
              break;
            case '105':
              gatewayGroup = 'xorJoin';
              break;
          }
          if (!logContainsGateway(PetriNet.transitions[x])) {
            nodes.add({
              id: PetriNet.transitions[x].gatewayID,
              group: gatewayGroup,
              label: label,
              title: PetriNet.transitions[x].label,
            });
          }
          logGatewayTransition(PetriNet.transitions[x]);
        }
      }

      if (generateWorkFlowNet === true) {
        replaceGatewayArcs(PetriNet.arcs);
      }

      for (let x = 0; x < PetriNet.arcs.length; x++) {
        edges.add({
          from: PetriNet.arcs[x].source,
          to: PetriNet.arcs[x].target,
          arrows: 'to',
        });
      }
      resetGatewayLog();
      return { nodes: nodes, edges: edges };
    }
  }

  public static async displayBPMNModel(modelAsBPMN: string): Promise<void> {
    const container = document.getElementById('model-container');
    if (!container) return;

    container.innerHTML = '';

    // Create a new Viewer
    const viewer: BpmnViewer = new BpmnJS({
      container: '#model-container',
      keyboard: {
        bindTo: window,
      },
    });

    try {
      // Display the BPMN Model
      await viewer.importXML(ModelDisplayer.normalizeBpmnLayout(modelAsBPMN));
      const canvas = viewer.get('canvas');
      canvas.resized();
      canvas.zoom('fit-viewport');
    } catch (err) {}
  }

  private static normalizeBpmnLayout(modelAsBPMN: string): string {
    const doc = new DOMParser().parseFromString(modelAsBPMN, 'text/xml');

    if (ModelDisplayer.findElementsByName(doc, 'parsererror').length > 0) {
      return modelAsBPMN;
    }

    const elements = ModelDisplayer.getBpmnFlowElements(doc);
    const flows = ModelDisplayer.getBpmnSequenceFlows(doc).filter(
      (flow) =>
        elements.some((element) => element.id === flow.sourceRef) &&
        elements.some((element) => element.id === flow.targetRef)
    );

    if (elements.length < 2 || flows.length === 0) {
      return modelAsBPMN;
    }

    const currentBounds = ModelDisplayer.getCurrentBpmnBounds(doc);
    if (!ModelDisplayer.needsBpmnRelayout(currentBounds, flows)) {
      return modelAsBPMN;
    }

    const layout = ModelDisplayer.createBpmnLayout(elements, flows);
    ModelDisplayer.applyBpmnShapeLayout(doc, layout);
    ModelDisplayer.applyBpmnEdgeLayout(doc, layout, flows);

    return new XMLSerializer().serializeToString(doc);
  }

  private static findElementsByName(doc: Document | Element, name: string): Element[] {
    return Array.from(doc.getElementsByTagName('*')).filter(
      (element) => element.localName === name
    );
  }

  private static getBpmnFlowElements(
    doc: Document
  ): Pick<BpmnElementLayout, 'id' | 'kind'>[] {
    return Array.from(doc.getElementsByTagName('*'))
      .filter((element) =>
        ModelDisplayer.bpmnElementNames.has(element.localName)
      )
      .map((element) => ({
        id: element.getAttribute('id') || '',
        kind: element.localName,
      }))
      .filter((element) => element.id.length > 0);
  }

  private static getBpmnSequenceFlows(doc: Document): BpmnSequenceFlow[] {
    return ModelDisplayer.findElementsByName(doc, 'sequenceFlow')
      .map((flow) => ({
        id: flow.getAttribute('id') || '',
        sourceRef: flow.getAttribute('sourceRef') || '',
        targetRef: flow.getAttribute('targetRef') || '',
      }))
      .filter(
        (flow) =>
          flow.id.length > 0 &&
          flow.sourceRef.length > 0 &&
          flow.targetRef.length > 0
      );
  }

  private static getCurrentBpmnBounds(doc: Document): Map<string, BpmnBounds> {
    const bounds = new Map<string, BpmnBounds>();
    ModelDisplayer.findElementsByName(doc, 'BPMNShape').forEach((shape) => {
      const bpmnElement = shape.getAttribute('bpmnElement');
      const boundsElement = ModelDisplayer.findElementsByName(shape, 'Bounds')[0];
      if (!bpmnElement || !boundsElement) return;

      bounds.set(bpmnElement, {
        x: Number(boundsElement.getAttribute('x')),
        y: Number(boundsElement.getAttribute('y')),
        width: Number(boundsElement.getAttribute('width')),
        height: Number(boundsElement.getAttribute('height')),
      });
    });
    return bounds;
  }

  private static needsBpmnRelayout(
    bounds: Map<string, BpmnBounds>,
    flows: BpmnSequenceFlow[]
  ): boolean {
    if (bounds.size < 2) return false;

    const allBounds = Array.from(bounds.values());
    for (let i = 0; i < allBounds.length; i++) {
      for (let j = i + 1; j < allBounds.length; j++) {
        if (ModelDisplayer.boundsOverlap(allBounds[i], allBounds[j])) {
          return true;
        }
      }
    }

    return flows.some((flow) => {
      const source = bounds.get(flow.sourceRef);
      const target = bounds.get(flow.targetRef);
      if (!source || !target) return false;
      return target.x - (source.x + source.width) < 80;
    });
  }

  private static boundsOverlap(first: BpmnBounds, second: BpmnBounds): boolean {
    const padding = 12;
    return !(
      first.x + first.width + padding < second.x ||
      second.x + second.width + padding < first.x ||
      first.y + first.height + padding < second.y ||
      second.y + second.height + padding < first.y
    );
  }

  private static createBpmnLayout(
    elements: Pick<BpmnElementLayout, 'id' | 'kind'>[],
    flows: BpmnSequenceFlow[]
  ): BpmnElementLayout[] {
    const rankById = new Map(elements.map((element) => [element.id, 0]));

    for (let i = 0; i < elements.length; i++) {
      flows.forEach((flow) => {
        const sourceRank = rankById.get(flow.sourceRef);
        const targetRank = rankById.get(flow.targetRef);
        if (sourceRank === undefined || targetRank === undefined) return;
        if (targetRank <= sourceRank) {
          rankById.set(flow.targetRef, sourceRank + 1);
        }
      });
    }

    const byRank = new Map<number, Pick<BpmnElementLayout, 'id' | 'kind'>[]>();
    elements.forEach((element) => {
      const rank = rankById.get(element.id) || 0;
      byRank.set(rank, [...(byRank.get(rank) || []), element]);
    });

    const layout: BpmnElementLayout[] = [];
    Array.from(byRank.entries()).forEach(([rank, rankedElements]) => {
      const columnHeight = (rankedElements.length - 1) * 140;
      rankedElements.forEach((element, index) => {
        const size = ModelDisplayer.getBpmnElementSize(element.kind);
        layout.push({
          ...element,
          rank,
          x: 90 + rank * 220,
          y: 140 - columnHeight / 2 + index * 140,
          width: size.width,
          height: size.height,
        });
      });
    });

    return layout;
  }

  private static getBpmnElementSize(kind: string): Pick<BpmnBounds, 'width' | 'height'> {
    if (kind.includes('Event')) {
      return { width: 36, height: 36 };
    }

    if (kind.includes('Gateway')) {
      return { width: 50, height: 50 };
    }

    if (kind === 'subProcess' || kind === 'callActivity') {
      return { width: 150, height: 95 };
    }

    return { width: 130, height: 82 };
  }

  private static applyBpmnShapeLayout(
    doc: Document,
    layout: BpmnElementLayout[]
  ): void {
    const shapeByElement = new Map<string, Element>();
    ModelDisplayer.findElementsByName(doc, 'BPMNShape').forEach((shape) => {
      const bpmnElement = shape.getAttribute('bpmnElement');
      if (bpmnElement) shapeByElement.set(bpmnElement, shape);
    });

    layout.forEach((element) => {
      const shape = shapeByElement.get(element.id);
      if (!shape) return;

      let bounds = ModelDisplayer.findElementsByName(shape, 'Bounds')[0];
      if (!bounds) {
        bounds = doc.createElementNS(
          'http://www.omg.org/spec/DD/20100524/DC',
          'dc:Bounds'
        );
        shape.appendChild(bounds);
      }

      bounds.setAttribute('x', String(element.x));
      bounds.setAttribute('y', String(element.y));
      bounds.setAttribute('width', String(element.width));
      bounds.setAttribute('height', String(element.height));
    });
  }

  private static applyBpmnEdgeLayout(
    doc: Document,
    layout: BpmnElementLayout[],
    flows: BpmnSequenceFlow[]
  ): void {
    const layoutById = new Map(layout.map((element) => [element.id, element]));
    const edgeByElement = new Map<string, Element>();
    ModelDisplayer.findElementsByName(doc, 'BPMNEdge').forEach((edge) => {
      const bpmnElement = edge.getAttribute('bpmnElement');
      if (bpmnElement) edgeByElement.set(bpmnElement, edge);
    });

    flows.forEach((flow) => {
      const edge = edgeByElement.get(flow.id);
      const source = layoutById.get(flow.sourceRef);
      const target = layoutById.get(flow.targetRef);
      if (!edge || !source || !target) return;

      ModelDisplayer.findElementsByName(edge, 'waypoint').forEach((waypoint) =>
        edge.removeChild(waypoint)
      );

      const start = {
        x: source.x + source.width,
        y: source.y + source.height / 2,
      };
      const end = {
        x: target.x,
        y: target.y + target.height / 2,
      };
      const middleX = start.x + Math.max(40, (end.x - start.x) / 2);

      [
        start,
        { x: middleX, y: start.y },
        { x: middleX, y: end.y },
        end,
      ].forEach((point) => {
        const waypoint = doc.createElementNS(
          'http://www.omg.org/spec/DD/20100524/DI',
          'di:waypoint'
        );
        waypoint.setAttribute('x', String(point.x));
        waypoint.setAttribute('y', String(point.y));
        edge.appendChild(waypoint);
      });
    });
  }
}
