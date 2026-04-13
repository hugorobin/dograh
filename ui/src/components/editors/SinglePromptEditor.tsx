'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';

import { useWorkflow } from '@/app/workflow/[workflowId]/contexts/WorkflowContext';
import { useWorkflowStore } from '@/app/workflow/[workflowId]/stores/workflowStore';
import { DocumentSelector } from '@/components/flow/DocumentSelector';
import { MentionTextarea } from '@/components/flow/MentionTextarea';
import { ToolSelector } from '@/components/flow/ToolSelector';
import { FlowEdge, FlowNode } from '@/components/flow/types';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    buildSinglePromptGraph,
    parseSinglePromptForm,
    type SinglePromptForm,
} from '@/lib/agentAuthoringGraph';
import { DEFAULT_WORKFLOW_CONFIGURATIONS, type WorkflowConfigurations } from '@/types/workflow-configurations';

export type SinglePromptEditorHandle = {
    saveAll: () => Promise<{ versionNumber?: number; versionStatus?: string } | undefined>;
};

type SinglePromptEditorProps = {
    readOnly?: boolean;
};

const emptyForm: SinglePromptForm = {
    greeting: '',
    agentPrompt: '',
    toolUuids: [],
    documentUuids: [],
};

export const SinglePromptEditor = forwardRef<SinglePromptEditorHandle, SinglePromptEditorProps>(
    function SinglePromptEditor({ readOnly = false }, ref) {
        const { saveWorkflowCore, tools, documents, recordings } = useWorkflow();
        const nodes = useWorkflowStore((s) => s.nodes);
        const edges = useWorkflowStore((s) => s.edges);
        const workflowConfigurations = useWorkflowStore((s) => s.workflowConfigurations);
        const setNodes = useWorkflowStore((s) => s.setNodes);
        const setEdges = useWorkflowStore((s) => s.setEdges);
        const setIsDirty = useWorkflowStore((s) => s.setIsDirty);

        const [form, setForm] = useState<SinglePromptForm>(emptyForm);

        const parsed = useMemo(() => parseSinglePromptForm(nodes, edges), [nodes, edges]);

        useEffect(() => {
            if (parsed) {
                setForm(parsed);
            }
        }, [parsed]);

        const syncDirty = useCallback(
            (next: SinglePromptForm) => {
                const baseline = parsed ?? emptyForm;
                const dirty =
                    next.greeting !== baseline.greeting ||
                    next.agentPrompt !== baseline.agentPrompt ||
                    JSON.stringify(next.toolUuids) !== JSON.stringify(baseline.toolUuids) ||
                    JSON.stringify(next.documentUuids) !== JSON.stringify(baseline.documentUuids);
                setIsDirty(dirty);
            },
            [parsed, setIsDirty]
        );

        const saveAll = useCallback(async () => {
            const { nodes: flowNodes, edges: flowEdges } = buildSinglePromptGraph(form);
            setNodes(flowNodes as FlowNode[], undefined);
            setEdges(flowEdges as FlowEdge[], undefined);
            const base = workflowConfigurations ?? DEFAULT_WORKFLOW_CONFIGURATIONS;
            const merged: WorkflowConfigurations = {
                ...base,
                agent_mode: 'single_prompt',
            };
            const result = await saveWorkflowCore(true, { workflowConfigurations: merged });
            return result;
        }, [form, saveWorkflowCore, setEdges, setNodes, workflowConfigurations]);

        useImperativeHandle(ref, () => ({ saveAll }), [saveAll]);

        if (!parsed && nodes.length > 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                    <p className="max-w-md">
                        This workflow doesn&apos;t match the single-prompt layout (needs one start, one agent, and one
                        end node). Switch to <strong>Graph</strong> authoring to edit it, or fix the graph structure.
                    </p>
                </div>
            );
        }

        return (
            <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto space-y-8">
                <div>
                    <h2 className="text-lg font-semibold mb-1">Single prompt agent</h2>
                    <p className="text-sm text-muted-foreground">
                        One system prompt for the whole conversation—similar to a Retell single-prompt agent. Advanced
                        routing is available in Multi-prompt or Graph mode.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="sp-greeting">Opening greeting (optional)</Label>
                    <Textarea
                        id="sp-greeting"
                        disabled={readOnly}
                        placeholder="e.g. Hi, thanks for calling Acme Corp."
                        value={form.greeting}
                        onChange={(e) => {
                            const next = { ...form, greeting: e.target.value };
                            setForm(next);
                            syncDirty(next);
                        }}
                        className="min-h-[80px]"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="sp-prompt">Agent instructions</Label>
                    <MentionTextarea
                        value={form.agentPrompt}
                        onChange={(value) => {
                            const next = { ...form, agentPrompt: value };
                            setForm(next);
                            syncDirty(next);
                        }}
                        placeholder="Identity, style, guidelines, and task steps for your voice agent..."
                        className="min-h-[220px] font-mono text-sm"
                        recordings={recordings}
                    />
                </div>

                <ToolSelector
                    value={form.toolUuids}
                    onChange={(toolUuids) => {
                        const next = { ...form, toolUuids };
                        setForm(next);
                        syncDirty(next);
                    }}
                    tools={tools ?? []}
                    disabled={readOnly}
                    showLabel={true}
                />

                <DocumentSelector
                    value={form.documentUuids}
                    onChange={(documentUuids) => {
                        const next = { ...form, documentUuids };
                        setForm(next);
                        syncDirty(next);
                    }}
                    documents={documents ?? []}
                    disabled={readOnly}
                    showLabel={true}
                />
            </div>
        );
    }
);
