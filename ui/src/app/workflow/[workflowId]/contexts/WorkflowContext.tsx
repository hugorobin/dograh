import { createContext, useContext } from 'react';

import type { SaveWorkflowExtras } from '@/app/workflow/[workflowId]/hooks/useWorkflowState';
import type { DocumentResponseSchema, ToolResponse } from '@/client/types.gen';
import type { RecordingResponseSchema } from '@/client/types.gen';

interface WorkflowContextType {
    saveWorkflow: (updateWorkflowDefinition?: boolean) => Promise<void>;
    /** PUT workflow without single/multi intercept — for alternate authoring UIs. */
    saveWorkflowCore: (
        updateWorkflowDefinition?: boolean,
        extras?: SaveWorkflowExtras
    ) => Promise<{ versionNumber?: number; versionStatus?: string } | undefined>;
    documents?: DocumentResponseSchema[];
    tools?: ToolResponse[];
    recordings?: RecordingResponseSchema[];
    readOnly?: boolean;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

export const WorkflowProvider = WorkflowContext.Provider;

export const useWorkflow = () => {
    const context = useContext(WorkflowContext);
    if (!context) {
        throw new Error('useWorkflow must be used within a WorkflowProvider');
    }
    return context;
};

// Optional hook that doesn't throw if context is not available
export const useWorkflowOptional = () => {
    return useContext(WorkflowContext);
};
