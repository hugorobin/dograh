'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';

import { useWorkflow } from '@/app/workflow/[workflowId]/contexts/WorkflowContext';
import { useWorkflowStore } from '@/app/workflow/[workflowId]/stores/workflowStore';
import { DocumentSelector } from '@/components/flow/DocumentSelector';
import { MentionTextarea } from '@/components/flow/MentionTextarea';
import { ToolSelector } from '@/components/flow/ToolSelector';
import { FlowEdge, FlowNode } from '@/components/flow/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    buildMultiPromptGraph,
    parseMultiPromptForm,
    type MultiPromptState,
    type MultiPromptTransition,
} from '@/lib/agentAuthoringGraph';
import { getRandomId } from '@/lib/utils';
import { DEFAULT_WORKFLOW_CONFIGURATIONS, type WorkflowConfigurations } from '@/types/workflow-configurations';

export type MultiPromptEditorHandle = {
    saveAll: () => Promise<{ versionNumber?: number; versionStatus?: string } | undefined>;
};

type MultiPromptEditorProps = {
    readOnly?: boolean;
};

function defaultState(): MultiPromptState {
    return {
        id: getRandomId(),
        name: 'Conversation state',
        prompt: '',
        toolUuids: [],
        documentUuids: [],
        transitions: [
            { label: 'Done', condition: 'When this step is complete.', targetStateId: '__end__' },
        ],
    };
}

export const MultiPromptEditor = forwardRef<MultiPromptEditorHandle, MultiPromptEditorProps>(
    function MultiPromptEditor({ readOnly = false }, ref) {
        const { saveWorkflowCore, tools, documents, recordings } = useWorkflow();
        const nodes = useWorkflowStore((s) => s.nodes);
        const edges = useWorkflowStore((s) => s.edges);
        const workflowConfigurations = useWorkflowStore((s) => s.workflowConfigurations);
        const setNodes = useWorkflowStore((s) => s.setNodes);
        const setEdges = useWorkflowStore((s) => s.setEdges);
        const setIsDirty = useWorkflowStore((s) => s.setIsDirty);

        const [startGreeting, setStartGreeting] = useState('');
        const [states, setStates] = useState<MultiPromptState[]>([defaultState()]);

        const parsed = useMemo(() => parseMultiPromptForm(nodes, edges), [nodes, edges]);

        useEffect(() => {
            if (parsed && parsed.states.length > 0) {
                setStates(parsed.states);
                setStartGreeting(parsed.startGreeting);
            }
        }, [parsed]);

        const touchDirty = useCallback(() => setIsDirty(true), [setIsDirty]);

        const saveAll = useCallback(async () => {
            const { nodes: n, edges: e } = buildMultiPromptGraph(states, { startGreeting });
            setNodes(n as FlowNode[], undefined);
            setEdges(e as FlowEdge[], undefined);
            const base = workflowConfigurations ?? DEFAULT_WORKFLOW_CONFIGURATIONS;
            const merged: WorkflowConfigurations = { ...base, agent_mode: 'multi_prompt' };
            return saveWorkflowCore(true, { workflowConfigurations: merged });
        }, [saveWorkflowCore, setEdges, setNodes, startGreeting, states, workflowConfigurations]);

        useImperativeHandle(ref, () => ({ saveAll }), [saveAll]);

        const targetOptionsFor = useCallback(
            (stateId: string) => {
                const opts: { value: string; label: string }[] = states
                    .filter((s) => s.id !== stateId)
                    .map((s) => ({ value: s.id, label: s.name || s.id }));
                opts.push({ value: '__end__', label: 'End call' });
                return opts;
            },
            [states]
        );

        const addState = () => {
            setStates((prev) => [...prev, defaultState()]);
            touchDirty();
        };

        const removeState = (id: string) => {
            setStates((prev) => {
                if (prev.length <= 1) return prev;
                const next = prev.filter((s) => s.id !== id);
                return next.map((s) => ({
                    ...s,
                    transitions: s.transitions.map((t) =>
                        t.targetStateId === id ? { ...t, targetStateId: '__end__' as const } : t
                    ),
                }));
            });
            touchDirty();
        };

        const moveState = (index: number, dir: -1 | 1) => {
            setStates((prev) => {
                const j = index + dir;
                if (j < 0 || j >= prev.length) return prev;
                const copy = [...prev];
                [copy[index], copy[j]] = [copy[j], copy[index]];
                return copy;
            });
            touchDirty();
        };

        const updateTransition = (
            stateIndex: number,
            tIndex: number,
            patch: Partial<MultiPromptTransition>
        ) => {
            setStates((prev) => {
                const copy = [...prev];
                const st = { ...copy[stateIndex] };
                const tr = [...st.transitions];
                tr[tIndex] = { ...tr[tIndex], ...patch };
                st.transitions = tr;
                copy[stateIndex] = st;
                return copy;
            });
            touchDirty();
        };

        const addTransition = (stateIndex: number) => {
            setStates((prev) => {
                const copy = [...prev];
                const st = { ...copy[stateIndex] };
                const other = prev.find((s, i) => i !== stateIndex);
                st.transitions = [
                    ...st.transitions,
                    {
                        label: 'Next',
                        condition: 'When this condition is met.',
                        targetStateId: other?.id ?? '__end__',
                    },
                ];
                copy[stateIndex] = st;
                return copy;
            });
            touchDirty();
        };

        const removeTransition = (stateIndex: number, tIndex: number) => {
            setStates((prev) => {
                const copy = [...prev];
                const st = { ...copy[stateIndex] };
                if (st.transitions.length <= 1) return prev;
                st.transitions = st.transitions.filter((_, i) => i !== tIndex);
                copy[stateIndex] = st;
                return copy;
            });
            touchDirty();
        };

        if (!parsed && nodes.length > 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                    <p className="max-w-md">
                        Couldn&apos;t map this workflow to multi-prompt states (needs a start node, agent nodes, and an
                        end node). Switch to <strong>Graph</strong> mode to edit the raw flow.
                    </p>
                </div>
            );
        }

        return (
            <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-8 pb-24">
                <div>
                    <h2 className="text-lg font-semibold mb-1">Multi-prompt agent</h2>
                    <p className="text-sm text-muted-foreground">
                        Each card is a conversation state with its own prompt and transitions—similar to Retell
                        multi-prompt trees. Transitions become graph edges for the runtime engine.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="mp-greeting">Opening greeting (optional)</Label>
                    <Input
                        id="mp-greeting"
                        disabled={readOnly}
                        placeholder="Short line the assistant says first"
                        value={startGreeting}
                        onChange={(e) => {
                            setStartGreeting(e.target.value);
                            touchDirty();
                        }}
                    />
                </div>

                <div className="space-y-4">
                    {states.map((state, si) => (
                        <Card key={state.id}>
                            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                                <CardTitle className="text-base">State {si + 1}</CardTitle>
                                <div className="flex gap-1 shrink-0">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={readOnly || si === 0}
                                        onClick={() => moveState(si, -1)}
                                        aria-label="Move up"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={readOnly || si >= states.length - 1}
                                        onClick={() => moveState(si, 1)}
                                        aria-label="Move down"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={readOnly || states.length <= 1}
                                        onClick={() => removeState(state.id)}
                                        aria-label="Remove state"
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>State name</Label>
                                    <Input
                                        disabled={readOnly}
                                        value={state.name}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setStates((prev) => {
                                                const c = [...prev];
                                                c[si] = { ...c[si], name: v };
                                                return c;
                                            });
                                            touchDirty();
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Prompt</Label>
                                    <MentionTextarea
                                        value={state.prompt}
                                        onChange={(value) => {
                                            setStates((prev) => {
                                                const c = [...prev];
                                                c[si] = { ...c[si], prompt: value };
                                                return c;
                                            });
                                            touchDirty();
                                        }}
                                        className="min-h-[160px] font-mono text-sm"
                                        recordings={recordings}
                                    />
                                </div>
                                <ToolSelector
                                    value={state.toolUuids}
                                    onChange={(toolUuids) => {
                                        setStates((prev) => {
                                            const c = [...prev];
                                            c[si] = { ...c[si], toolUuids };
                                            return c;
                                        });
                                        touchDirty();
                                    }}
                                    tools={tools ?? []}
                                    disabled={readOnly}
                                />
                                <DocumentSelector
                                    value={state.documentUuids}
                                    onChange={(documentUuids) => {
                                        setStates((prev) => {
                                            const c = [...prev];
                                            c[si] = { ...c[si], documentUuids };
                                            return c;
                                        });
                                        touchDirty();
                                    }}
                                    documents={documents ?? []}
                                    disabled={readOnly}
                                />

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Transitions</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={readOnly}
                                            onClick={() => addTransition(si)}
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add transition
                                        </Button>
                                    </div>
                                    {state.transitions.map((t, ti) => (
                                        <div key={`${state.id}-tr-${ti}`} className="grid gap-2 md:grid-cols-2 border rounded-md p-3">
                                            <Input
                                                disabled={readOnly}
                                                placeholder="Label (LLM function name hint)"
                                                value={t.label}
                                                onChange={(e) => updateTransition(si, ti, { label: e.target.value })}
                                            />
                                            <Select
                                                disabled={readOnly}
                                                value={t.targetStateId}
                                                onValueChange={(v) => updateTransition(si, ti, { targetStateId: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Target" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {targetOptionsFor(state.id).map((o) => (
                                                        <SelectItem key={o.value} value={o.value}>
                                                            {o.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <div className="md:col-span-2">
                                                <Input
                                                    disabled={readOnly}
                                                    placeholder="Condition — when to take this transition"
                                                    value={t.condition}
                                                    onChange={(e) =>
                                                        updateTransition(si, ti, { condition: e.target.value })
                                                    }
                                                />
                                            </div>
                                            {state.transitions.length > 1 && (
                                                <div className="md:col-span-2 flex justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={readOnly}
                                                        onClick={() => removeTransition(si, ti)}
                                                    >
                                                        Remove transition
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Button type="button" variant="secondary" disabled={readOnly} onClick={addState}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add state
                </Button>
            </div>
        );
    }
);
