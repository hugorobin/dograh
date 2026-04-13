import { FlowEdge, FlowNode, FlowNodeData, NodeType } from '@/components/flow/types';
import { getRandomId } from '@/lib/utils';

/** Minimal start-node prompt (required by API); greeting carries the opening line. */
export const SINGLE_PROMPT_START_NODE_PROMPT =
    'Open the call with a brief, natural greeting using the configured greeting text, then continue the conversation according to the next step.';

export const SINGLE_PROMPT_END_NODE_PROMPT =
    'Close the call politely. Thank the user and say goodbye.';

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.75 };

export type SinglePromptForm = {
    greeting: string;
    agentPrompt: string;
    toolUuids: string[];
    documentUuids: string[];
};

export type MultiPromptTransition = {
    label: string;
    condition: string;
    /** Local state id (not node id) or "__end__" */
    targetStateId: string;
};

export type MultiPromptState = {
    id: string;
    name: string;
    prompt: string;
    toolUuids: string[];
    documentUuids: string[];
    transitions: MultiPromptTransition[];
};

const SP_START = 'sp-start';
const SP_AGENT = 'sp-agent';
const SP_END = 'sp-end';

const MP_START = 'mp-start';
const MP_END = 'mp-end';

function agentDataBase(overrides: Partial<FlowNodeData> & { name: string; prompt: string }): FlowNodeData {
    return {
        ...overrides,
        allow_interrupt: overrides.allow_interrupt ?? true,
        add_global_prompt: overrides.add_global_prompt ?? true,
        is_static: false,
    };
}

/** Build the canonical 3-node graph for single-prompt mode. */
export function buildSinglePromptGraph(form: SinglePromptForm): { nodes: FlowNode[]; edges: FlowEdge[]; viewport: typeof DEFAULT_VIEWPORT } {
    const greeting = form.greeting.trim();
    const nodes: FlowNode[] = [
        {
            id: SP_START,
            type: NodeType.START_CALL,
            position: { x: 120, y: 160 },
            data: agentDataBase({
                name: 'Start Call',
                prompt: SINGLE_PROMPT_START_NODE_PROMPT,
                greeting: greeting || undefined,
                allow_interrupt: false,
                is_start: true,
                add_global_prompt: false,
                detect_voicemail: true,
            }),
        },
        {
            id: SP_AGENT,
            type: NodeType.AGENT_NODE,
            position: { x: 420, y: 160 },
            data: agentDataBase({
                name: 'Main conversation',
                prompt: form.agentPrompt,
                tool_uuids: form.toolUuids.length ? form.toolUuids : undefined,
                document_uuids: form.documentUuids.length ? form.documentUuids : undefined,
            }),
        },
        {
            id: SP_END,
            type: NodeType.END_CALL,
            position: { x: 720, y: 160 },
            data: agentDataBase({
                name: 'End Call',
                prompt: SINGLE_PROMPT_END_NODE_PROMPT,
                allow_interrupt: false,
                is_end: true,
                add_global_prompt: false,
            }),
        },
    ];

    const edges: FlowEdge[] = [
        {
            id: `${SP_START}-${SP_AGENT}`,
            source: SP_START,
            target: SP_AGENT,
            type: 'custom',
            data: {
                label: 'Continue',
                condition: 'After the opening greeting, continue with the main conversation.',
            },
        },
        {
            id: `${SP_AGENT}-${SP_END}`,
            source: SP_AGENT,
            target: SP_END,
            type: 'custom',
            data: {
                label: 'End call',
                condition: 'When the conversation is complete or the user wants to hang up.',
            },
        },
    ];

    return { nodes, edges, viewport: { ...DEFAULT_VIEWPORT } };
}

/** Parse single-prompt form from graph built by us or matching topology. */
export function parseSinglePromptForm(nodes: FlowNode[], edges: FlowEdge[]): SinglePromptForm | null {
    const start =
        nodes.find((n) => n.id === SP_START) ?? nodes.find((n) => n.type === NodeType.START_CALL && n.data.is_start);
    const agent =
        nodes.find((n) => n.id === SP_AGENT) ??
        nodes.filter((n) => n.type === NodeType.AGENT_NODE).find((n) => {
            const ins = edges.filter((e) => e.target === n.id).length;
            const outs = edges.filter((e) => e.source === n.id).length;
            return ins >= 1 && outs >= 1;
        });
    const end =
        nodes.find((n) => n.id === SP_END) ??
        nodes.find((n) => n.type === NodeType.END_CALL && n.data.is_end) ??
        nodes.find((n) => n.type === NodeType.END_CALL);

    if (!start || !agent || !end) return null;
    const agents = nodes.filter((n) => n.type === NodeType.AGENT_NODE);
    if (agents.length !== 1) return null;

    return {
        greeting: (start.data.greeting as string | undefined) ?? '',
        agentPrompt: agent.data.prompt ?? '',
        toolUuids: [...(agent.data.tool_uuids ?? [])],
        documentUuids: [...(agent.data.document_uuids ?? [])],
    };
}

/** Build graph from multi-prompt state list. */
export function buildMultiPromptGraph(
    states: MultiPromptState[],
    options?: { startGreeting?: string }
): { nodes: FlowNode[]; edges: FlowEdge[]; viewport: typeof DEFAULT_VIEWPORT } {
    if (states.length === 0) {
        return {
            nodes: [],
            edges: [],
            viewport: { ...DEFAULT_VIEWPORT },
        };
    }

    const startGreeting = options?.startGreeting?.trim() ?? '';
    const rowY = 180;
    let x = 80;

    const nodes: FlowNode[] = [
        {
            id: MP_START,
            type: NodeType.START_CALL,
            position: { x, y: rowY },
            data: agentDataBase({
                name: 'Start Call',
                prompt: SINGLE_PROMPT_START_NODE_PROMPT,
                greeting: startGreeting || undefined,
                allow_interrupt: false,
                is_start: true,
                add_global_prompt: false,
                detect_voicemail: true,
            }),
        },
    ];
    x += 280;

    const stateNodeIds = new Map<string, string>();
    for (const s of states) {
        const nid = `mp-${s.id}`;
        stateNodeIds.set(s.id, nid);
        nodes.push({
            id: nid,
            type: NodeType.AGENT_NODE,
            position: { x, y: rowY },
            data: agentDataBase({
                name: s.name,
                prompt: s.prompt,
                tool_uuids: s.toolUuids.length ? s.toolUuids : undefined,
                document_uuids: s.documentUuids.length ? s.documentUuids : undefined,
            }),
        });
        x += 280;
    }

    nodes.push({
        id: MP_END,
        type: NodeType.END_CALL,
        position: { x, y: rowY },
        data: agentDataBase({
            name: 'End Call',
            prompt: SINGLE_PROMPT_END_NODE_PROMPT,
            allow_interrupt: false,
            is_end: true,
            add_global_prompt: false,
        }),
    });

    const edges: FlowEdge[] = [];
    const firstStateId = states[0].id;
    edges.push({
        id: `${MP_START}-mp-${firstStateId}`,
        source: MP_START,
        target: `mp-${firstStateId}`,
        type: 'custom',
        data: {
            label: 'Start',
            condition: 'Begin the conversation flow.',
        },
    });

    for (const s of states) {
        const src = `mp-${s.id}`;
        const transitions = s.transitions.length
            ? s.transitions
            : [{ label: 'Done', condition: 'When this step is complete.', targetStateId: '__end__' as const }];

        for (let i = 0; i < transitions.length; i++) {
            const t = transitions[i];
            const targetNodeId =
                t.targetStateId === '__end__' ? MP_END : `mp-${t.targetStateId}`;
            const edgeId = `${src}-${targetNodeId}-${i}`;
            edges.push({
                id: edgeId,
                source: src,
                target: targetNodeId,
                type: 'custom',
                data: {
                    label: t.label || `Transition ${i + 1}`,
                    condition: t.condition || 'When this condition is met.',
                },
            });
        }
    }

    return { nodes, edges, viewport: { ...DEFAULT_VIEWPORT } };
}

/** Initial graph for “new multi-prompt” workflows from the create dialog. */
export function createInitialMultiPromptDefinition(): {
    nodes: FlowNode[];
    edges: FlowEdge[];
    viewport: typeof DEFAULT_VIEWPORT;
} {
    return buildMultiPromptGraph([
        {
            id: getRandomId(),
            name: 'Conversation',
            prompt:
                '## Identity\nYou are a helpful voice assistant.\n\n## Task\n1. Greet the user and ask how you can help.\n\nwait for user response\n\n2. Answer clearly in short sentences.\n',
            toolUuids: [],
            documentUuids: [],
            transitions: [
                { label: 'Complete', condition: 'When the user is done.', targetStateId: '__end__' },
            ],
        },
    ]);
}

/**
 * Best-effort parse of multi-prompt states from a graph (ideally produced by buildMultiPromptGraph).
 * Agent nodes are ordered left-to-right by canvas position.
 */
export function parseMultiPromptForm(nodes: FlowNode[], edges: FlowEdge[]): { states: MultiPromptState[]; startGreeting: string } | null {
    const start = nodes.find((n) => n.id === MP_START) ?? nodes.find((n) => n.type === NodeType.START_CALL && n.data.is_start);
    const end = nodes.find((n) => n.id === MP_END) ?? nodes.find((n) => n.type === NodeType.END_CALL);
    if (!start || !end) return null;

    const agentNodes = nodes
        .filter((n) => n.type === NodeType.AGENT_NODE)
        .sort((a, b) => a.position.x - b.position.x);

    if (agentNodes.length === 0) return null;

    const localId = (nodeId: string) => (nodeId.startsWith('mp-') ? nodeId.slice(3) : nodeId);

    const states: MultiPromptState[] = agentNodes.map((n) => {
        const outs = edges.filter((e) => e.source === n.id);
        const transitions: MultiPromptTransition[] = outs.map((e) => {
            const isEnd = e.target === end.id;
            const tgtAgent = agentNodes.find((a) => a.id === e.target);
            return {
                label: e.data?.label ?? 'Next',
                condition: e.data?.condition ?? '',
                targetStateId: isEnd ? '__end__' : (tgtAgent ? localId(tgtAgent.id) : '__end__'),
            };
        });
        return {
            id: localId(n.id),
            name: n.data.name ?? 'State',
            prompt: n.data.prompt ?? '',
            toolUuids: [...(n.data.tool_uuids ?? [])],
            documentUuids: [...(n.data.document_uuids ?? [])],
            transitions,
        };
    });

    return {
        states,
        startGreeting: (start.data.greeting as string | undefined) ?? '',
    };
}
