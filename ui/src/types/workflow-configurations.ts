export interface VADConfiguration {
    confidence: number;
    start_seconds: number;
    stop_seconds: number;
    minimum_volume: number;
}

export interface AmbientNoiseConfiguration {
    enabled: boolean;
    volume: number;
    storage_key?: string;
    storage_backend?: string;
    original_filename?: string;
}

export type TurnStopStrategy = 'transcription' | 'turn_analyzer';

export interface VoicemailDetectionConfiguration {
    enabled: boolean;
    use_workflow_llm: boolean;
    provider?: string;
    model?: string;
    api_key?: string;
    system_prompt?: string;
    long_speech_timeout: number;  // seconds cutoff for long speech detection
}

export const DEFAULT_VOICEMAIL_DETECTION_CONFIGURATION: VoicemailDetectionConfiguration = {
    enabled: false,
    use_workflow_llm: true,
    long_speech_timeout: 8.0,
};

/** How the workflow is authored in the UI; stored in workflow_configurations. Runtime uses workflow_json only. */
export const AGENT_MODES = ['single_prompt', 'multi_prompt', 'graph'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export interface ModelOverrides {
    llm?: {
        provider?: string;
        model?: string;
        api_key?: string;
        [key: string]: unknown;
    };
    tts?: {
        provider?: string;
        model?: string;
        voice?: string;
        api_key?: string;
        [key: string]: unknown;
    };
    stt?: {
        provider?: string;
        model?: string;
        api_key?: string;
        [key: string]: unknown;
    };
    realtime?: {
        provider?: string;
        model?: string;
        voice?: string;
        api_key?: string;
        [key: string]: unknown;
    };
    is_realtime?: boolean;
}

export interface WorkflowConfigurations {
    /** Authoring mode: simple form, state list, or full React Flow canvas */
    agent_mode?: AgentMode;
    vad_configuration?: VADConfiguration;
    ambient_noise_configuration: AmbientNoiseConfiguration;
    max_call_duration: number;  // Maximum call duration in seconds
    max_user_idle_timeout: number;  // Maximum user idle time in seconds
    smart_turn_stop_secs: number;  // Timeout in seconds for incomplete turn detection
    turn_stop_strategy: TurnStopStrategy;  // Strategy for detecting end of user turn
    dictionary?: string;  // Comma-separated words for voice agent to listen for
    voicemail_detection?: VoicemailDetectionConfiguration;
    context_compaction_enabled?: boolean;  // Summarize context on node transitions to remove stale tool calls
    model_overrides?: ModelOverrides;  // Per-workflow model configuration overrides
    /** Optional Retell-style pre-connect URL: POST before inbound answer; response can set dynamic_variables / override_workflow_id */
    inbound_webhook_url?: string;
    /** Optional URL for signed lifecycle events call_started / call_ended (requires DOGRAH_WEBHOOK_SECRET on server) */
    outbound_webhook_url?: string;
    [key: string]: unknown;  // Allow additional properties for future configurations
}

/** Normalize agent_mode from API (missing = graph for backward compatibility). */
export function getAgentMode(config: WorkflowConfigurations | null | undefined): AgentMode {
    const m = config?.agent_mode;
    if (m === 'single_prompt' || m === 'multi_prompt' || m === 'graph') {
        return m;
    }
    return 'graph';
}

export const DEFAULT_WORKFLOW_CONFIGURATIONS: WorkflowConfigurations = {
    agent_mode: 'graph',
    ambient_noise_configuration: {
        enabled: false,
        volume: 0.3
    },
    max_call_duration: 600,  // 10 minutes
    max_user_idle_timeout: 10,  // 10 seconds
    smart_turn_stop_secs: 2,  // 2 seconds
    turn_stop_strategy: 'transcription',  // Default to transcription-based detection
    dictionary: ''
};
