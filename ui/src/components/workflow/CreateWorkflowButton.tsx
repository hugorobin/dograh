'use client';

import { Bot, ChevronDown, LayoutTemplate, PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { createWorkflowApiV1WorkflowCreateDefinitionPost } from '@/client/sdk.gen';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/lib/auth';
import { buildSinglePromptGraph, createInitialMultiPromptDefinition } from '@/lib/agentAuthoringGraph';
import logger from '@/lib/logger';
import { getRandomId } from '@/lib/utils';
import { DEFAULT_WORKFLOW_CONFIGURATIONS, type AgentMode } from '@/types/workflow-configurations';

const BLANK_GRAPH_WORKFLOW_DEFINITION = {
    nodes: [
        {
            id: "1",
            type: "startCall",
            position: { x: 175, y: 60 },
            data: {
                prompt: "# Goal\nYou are a helpful agent who is handing a conversation over voice with a human. This is a voice conversation, so transcripts can be error prone.\n\n## Rules\n- Language: UK English but does not have to be correct english\n- Keep responses short and 2-3 sentences max\n- If you have to repeat something that you said in your previous two turns, then rephrase a bit while keeping the same meaning. Never repeat the exact same words as in your previous 2 responses.\n\n## Speech Handling\n- There could be multiple transcription errors. \n- Accept variations: yes/yeah/yep/aye, no/nah/nope\n- If user says \"sorry?\" or \"pardon me\" or \"can you repeat\"  or \"what?\", they might not have heard you- so just repeat what you just said.\n\n### Flow\nStart by saying \"Hi\". Be polite and courteous. ",
                name: "start call",
                allow_interrupt: false,
                invalid: false,
                validationMessage: null,
                is_static: false,
                add_global_prompt: false,
                wait_for_user_response: false,
                detect_voicemail: true,
                delayed_start: false,
                is_start: true,
                selected_through_edge: false,
                hovered_through_edge: false,
                extraction_enabled: false,
                selected: false,
                dragging: false,
            },
        },
    ],
    edges: [],
    viewport: { x: 808, y: 269, zoom: 0.75 },
};

const DEFAULT_SINGLE_AGENT_PROMPT = `## Identity
You are a helpful voice assistant.

## Style
- Keep replies to 2–3 short sentences.
- This is voice: avoid symbols that are hard to speak.

## Task
1. Greet the user and ask how you can help.
2. Answer clearly.`;

function definitionForMode(mode: AgentMode): { nodes: unknown[]; edges: unknown[]; viewport: object } {
    if (mode === 'single_prompt') {
        const { nodes, edges, viewport } = buildSinglePromptGraph({
            greeting: '',
            agentPrompt: DEFAULT_SINGLE_AGENT_PROMPT,
            toolUuids: [],
            documentUuids: [],
        });
        return { nodes, edges, viewport };
    }
    if (mode === 'multi_prompt') {
        const { nodes, edges, viewport } = createInitialMultiPromptDefinition();
        return { nodes, edges, viewport };
    }
    return BLANK_GRAPH_WORKFLOW_DEFINITION;
}

export function CreateWorkflowButton() {
    const router = useRouter();
    const { user, getAccessToken } = useAuth();
    const [isCreating, setIsCreating] = useState(false);
    const [blankDialogOpen, setBlankDialogOpen] = useState(false);

    const handleAgentBuilder = () => {
        router.push('/workflow/create');
    };

    const createBlankWithMode = async (mode: AgentMode) => {
        if (isCreating || !user) return;
        setIsCreating(true);
        setBlankDialogOpen(false);

        try {
            const accessToken = await getAccessToken();
            const name = `Workflow-${getRandomId()}`;
            const workflow_definition = definitionForMode(mode);
            const workflow_configurations = {
                ...DEFAULT_WORKFLOW_CONFIGURATIONS,
                agent_mode: mode,
            };
            const response = await createWorkflowApiV1WorkflowCreateDefinitionPost({
                body: {
                    name,
                    workflow_definition: workflow_definition as unknown as { [key: string]: unknown },
                    workflow_configurations: workflow_configurations as Record<string, unknown>,
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (response.data?.id) {
                router.push(`/workflow/${response.data.id}`);
            }
        } catch (err) {
            logger.error(`Error creating blank workflow: ${err}`);
            toast.error('Failed to create workflow');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button disabled={isCreating}>
                        <PlusIcon className="w-4 h-4" />
                        {isCreating ? 'Creating...' : 'Create Agent'}
                        <ChevronDown className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleAgentBuilder} className="cursor-pointer">
                        <Bot className="w-4 h-4 mr-2" />
                        <div>
                            <div className="font-medium">Use Agent Builder</div>
                            <div className="text-xs text-muted-foreground">AI generates a workflow from your description</div>
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setBlankDialogOpen(true)}
                        disabled={isCreating}
                        className="cursor-pointer"
                    >
                        <LayoutTemplate className="w-4 h-4 mr-2" />
                        <div>
                            <div className="font-medium">Blank workflow…</div>
                            <div className="text-xs text-muted-foreground">Choose single, multi-prompt, or graph</div>
                        </div>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={blankDialogOpen} onOpenChange={setBlankDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New blank workflow</DialogTitle>
                        <DialogDescription>
                            Pick how you want to author the agent. You can change this later from the workflow editor.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 pt-2">
                        {(
                            [
                                {
                                    mode: 'single_prompt',
                                    title: 'Single prompt',
                                    description: 'One main instruction block — fastest path to a working agent.',
                                },
                                {
                                    mode: 'multi_prompt',
                                    title: 'Multi-prompt',
                                    description: 'Multiple states with prompts and transitions (Retell-style).',
                                },
                                {
                                    mode: 'graph',
                                    title: 'Graph',
                                    description: 'Full canvas: branches, triggers, webhooks, and custom layout.',
                                },
                            ] as const
                        ).map(({ mode, title, description }) => (
                            <button
                                key={mode}
                                type="button"
                                className="w-full text-left rounded-lg border bg-card px-6 py-4 hover:bg-accent/50 transition-colors"
                                onClick={() => void createBlankWithMode(mode)}
                            >
                                <p className="text-sm font-semibold leading-none tracking-tight">{title}</p>
                                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
