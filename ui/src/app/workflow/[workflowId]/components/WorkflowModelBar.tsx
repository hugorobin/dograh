"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getDefaultConfigurationsApiV1UserConfigurationsDefaultsGet } from "@/client/sdk.gen";
import { VoiceSelector } from "@/components/VoiceSelector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_DISPLAY_NAMES } from "@/constants/languages";
import { useUserConfig } from "@/context/UserConfigContext";
import { useAuth } from "@/lib/auth";
import type { ModelOverrides, WorkflowConfigurations } from "@/types/workflow-configurations";

type ServiceSegment = "llm" | "tts" | "stt" | "realtime";

interface SchemaProperty {
    type?: string;
    default?: string | number | boolean;
    enum?: string[];
    examples?: string[];
    model_options?: Record<string, string[]>;
    allow_custom_input?: boolean;
    $ref?: string;
}

interface ProviderSchema {
    properties: Record<string, SchemaProperty>;
    required?: string[];
    $defs?: Record<string, SchemaProperty>;
    [key: string]: unknown;
}

const VOICE_DISPLAY_NAMES: Record<string, string> = {
    anushka: "Anushka (Female)",
    manisha: "Manisha (Female)",
    vidya: "Vidya (Female)",
    arya: "Arya (Female)",
    abhilash: "Abhilash (Male)",
    karun: "Karun (Male)",
    hitesh: "Hitesh (Male)",
};

const LANGUAGE_AUTO = "__auto__";

function resolveProperty(
    providerSchema: ProviderSchema | undefined,
    field: string,
): SchemaProperty | undefined {
    if (!providerSchema?.properties?.[field]) return undefined;
    const schema = providerSchema.properties[field];
    if (schema.$ref && providerSchema.$defs) {
        const key = schema.$ref.split("/").pop() || "";
        return providerSchema.$defs[key];
    }
    return schema;
}

function dropdownOptionsForField(
    providerSchema: ProviderSchema | undefined,
    field: string,
    modelValue: string | undefined,
): string[] {
    const actual = resolveProperty(providerSchema, field);
    if (!actual) return [];
    let opts = actual.enum || actual.examples || [];
    if (actual.model_options && modelValue && actual.model_options[modelValue]) {
        opts = actual.model_options[modelValue];
    }
    return [...opts];
}

function mergeConfigSource(
    userConfig: Record<string, unknown> | null | undefined,
    currentOverrides: ModelOverrides | undefined,
): Record<string, unknown> {
    const merged = { ...userConfig } as Record<string, unknown>;
    const overrideServices: (keyof ModelOverrides)[] = ["llm", "tts", "stt", "realtime"];
    for (const svc of overrideServices) {
        const overrideVal = currentOverrides?.[svc];
        if (overrideVal && typeof overrideVal === "object") {
            const globalVal = userConfig?.[svc] as Record<string, unknown> | undefined;
            merged[svc] = { ...globalVal, ...overrideVal };
        }
    }
    if (currentOverrides?.is_realtime !== undefined) {
        merged.is_realtime = currentOverrides.is_realtime;
    }
    return merged;
}

export interface WorkflowModelBarProps {
    workflowConfigurations: WorkflowConfigurations;
    workflowId: number;
    readOnly?: boolean;
    onSaveOverrides: (overrides: ModelOverrides | undefined) => Promise<void>;
}

export function WorkflowModelBar({
    workflowConfigurations,
    workflowId,
    readOnly,
    onSaveOverrides,
}: WorkflowModelBarProps) {
    const { user, loading: authLoading } = useAuth();
    const { userConfig } = useUserConfig();
    const [schemas, setSchemas] = useState<Record<ServiceSegment, Record<string, ProviderSchema>>>({
        llm: {},
        tts: {},
        stt: {},
        realtime: {},
    });
    const [schemasReady, setSchemasReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (authLoading || !user) return;
        let cancelled = false;
        (async () => {
            const response = await getDefaultConfigurationsApiV1UserConfigurationsDefaultsGet();
            if (!response.data || cancelled) return;
            const data = response.data as Record<string, unknown>;
            const realtimeSchemas = (data.realtime || {}) as Record<string, ProviderSchema>;
            setSchemas({
                llm: response.data.llm as Record<string, ProviderSchema>,
                tts: response.data.tts as Record<string, ProviderSchema>,
                stt: response.data.stt as Record<string, ProviderSchema>,
                realtime: realtimeSchemas,
            });
            setSchemasReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [authLoading, user]);

    const configSource = useMemo(
        () =>
            mergeConfigSource(
                userConfig as Record<string, unknown> | null | undefined,
                workflowConfigurations.model_overrides,
            ),
        [userConfig, workflowConfigurations.model_overrides],
    );

    const isRealtime = !!configSource.is_realtime;

    const llmProvider = (configSource.llm as Record<string, unknown> | undefined)?.provider as
        | string
        | undefined;
    const ttsProvider = (configSource.tts as Record<string, unknown> | undefined)?.provider as
        | string
        | undefined;
    const sttProvider = (configSource.stt as Record<string, unknown> | undefined)?.provider as
        | string
        | undefined;
    const realtimeProvider = (configSource.realtime as Record<string, unknown> | undefined)
        ?.provider as string | undefined;

    const llmModel = (configSource.llm as Record<string, unknown> | undefined)?.model as
        | string
        | undefined;
    const ttsModel = (configSource.tts as Record<string, unknown> | undefined)?.model as
        | string
        | undefined;
    const ttsVoice = (configSource.tts as Record<string, unknown> | undefined)?.voice as
        | string
        | undefined;
    const realtimeModel = (configSource.realtime as Record<string, unknown> | undefined)?.model as
        | string
        | undefined;
    const realtimeVoice = (configSource.realtime as Record<string, unknown> | undefined)?.voice as
        | string
        | undefined;
    const realtimeLanguage = (configSource.realtime as Record<string, unknown> | undefined)
        ?.language as string | null | undefined;

    const ttsSchema = ttsProvider ? schemas.tts[ttsProvider] : undefined;
    const sttSchema = sttProvider ? schemas.stt[sttProvider] : undefined;
    const languageOnTts = !!ttsSchema?.properties?.language;
    const languageService: "tts" | "stt" = languageOnTts ? "tts" : "stt";
    const languageProvider = languageOnTts ? ttsProvider : sttProvider;
    const languageSchema = languageProvider
        ? languageOnTts
            ? schemas.tts[languageProvider]
            : schemas.stt[languageProvider]
        : undefined;
    const sttModel = (configSource.stt as Record<string, unknown> | undefined)?.model as
        | string
        | undefined;
    const ttsLanguage = (configSource.tts as Record<string, unknown> | undefined)?.language as
        | string
        | undefined;
    const sttLanguage = (configSource.stt as Record<string, unknown> | undefined)?.language as
        | string
        | undefined;
    const effectiveLanguageValue = languageOnTts ? ttsLanguage : sttLanguage;

    const llmSchema = llmProvider ? schemas.llm[llmProvider] : undefined;
    const realtimeSchema = realtimeProvider ? schemas.realtime[realtimeProvider] : undefined;

    const modelProviderSchema = isRealtime ? realtimeSchema : llmSchema;
    const modelProviderKey = isRealtime ? realtimeProvider : llmProvider;
    const currentModelValue = isRealtime ? realtimeModel : llmModel;

    const saveWithMerged = useCallback(
        async (build: (prev: ModelOverrides) => ModelOverrides) => {
            if (readOnly) return;
            setIsSaving(true);
            try {
                const prev = workflowConfigurations.model_overrides ?? {};
                const next = build({ ...prev });
                await onSaveOverrides(Object.keys(next).length > 0 ? next : undefined);
            } catch (e) {
                if (!(e instanceof Error && e.message === "WORKFLOW_DIRTY")) {
                    toast.error(e instanceof Error ? e.message : "Failed to save model settings");
                }
            } finally {
                setIsSaving(false);
            }
        },
        [onSaveOverrides, readOnly, workflowConfigurations.model_overrides],
    );

    const onModelChange = async (value: string) => {
        if (isRealtime) {
            const globalRt = userConfig?.realtime as Record<string, unknown> | undefined;
            await saveWithMerged((prev) => ({
                ...prev,
                realtime: {
                    ...globalRt,
                    ...prev.realtime,
                    provider: realtimeProvider,
                    model: value,
                } as ModelOverrides["realtime"],
            }));
            return;
        }
        const globalLlm = userConfig?.llm as Record<string, unknown> | undefined;
        await saveWithMerged((prev) => ({
            ...prev,
            llm: {
                ...globalLlm,
                ...prev.llm,
                provider: llmProvider,
                model: value,
            } as ModelOverrides["llm"],
        }));
    };

    const onVoiceChange = async (value: string) => {
        if (isRealtime) {
            const globalRt = userConfig?.realtime as Record<string, unknown> | undefined;
            await saveWithMerged((prev) => ({
                ...prev,
                realtime: {
                    ...globalRt,
                    ...prev.realtime,
                    provider: realtimeProvider,
                    voice: value,
                } as ModelOverrides["realtime"],
            }));
            return;
        }
        const globalTts = userConfig?.tts as Record<string, unknown> | undefined;
        await saveWithMerged((prev) => ({
            ...prev,
            tts: {
                ...globalTts,
                ...prev.tts,
                provider: ttsProvider,
                voice: value,
            } as ModelOverrides["tts"],
        }));
    };

    const onLanguageChange = async (value: string) => {
        const langValue = value === LANGUAGE_AUTO ? undefined : value;
        if (isRealtime) {
            const globalRt = userConfig?.realtime as Record<string, unknown> | undefined;
            await saveWithMerged((prev) => ({
                ...prev,
                realtime: {
                    ...globalRt,
                    ...prev.realtime,
                    provider: realtimeProvider,
                    ...(langValue !== undefined ? { language: langValue } : { language: null }),
                } as ModelOverrides["realtime"],
            }));
            return;
        }
        if (languageOnTts) {
            const globalTts = userConfig?.tts as Record<string, unknown> | undefined;
            await saveWithMerged((prev) => ({
                ...prev,
                tts: {
                    ...globalTts,
                    ...prev.tts,
                    provider: ttsProvider,
                    ...(langValue !== undefined ? { language: langValue } : {}),
                } as ModelOverrides["tts"],
            }));
        } else {
            const globalStt = userConfig?.stt as Record<string, unknown> | undefined;
            await saveWithMerged((prev) => ({
                ...prev,
                stt: {
                    ...globalStt,
                    ...prev.stt,
                    provider: sttProvider,
                    ...(langValue !== undefined ? { language: langValue } : {}),
                } as ModelOverrides["stt"],
            }));
        }
    };

    const modelOptions = useMemo(() => {
        const base = dropdownOptionsForField(
            modelProviderSchema,
            "model",
            undefined,
        );
        const cur = currentModelValue;
        if (cur && !base.includes(cur)) {
            return [...base, cur];
        }
        return base;
    }, [modelProviderSchema, currentModelValue]);

    const voiceFieldSchema = !isRealtime
        ? resolveProperty(ttsSchema, "voice")
        : resolveProperty(realtimeSchema, "voice");
    const voiceEnumOptions = useMemo(() => {
        if (!voiceFieldSchema) return [] as string[];
        const opts = voiceFieldSchema.enum || voiceFieldSchema.examples || [];
        const cur = isRealtime ? realtimeVoice : ttsVoice;
        if (cur && !opts.includes(cur)) {
            return [...opts, cur];
        }
        return [...opts];
    }, [voiceFieldSchema, isRealtime, realtimeVoice, ttsVoice]);

    const languageModelWatch = languageOnTts ? ttsModel : sttModel;
    const languageOptions = useMemo(() => {
        if (isRealtime) {
            const base = dropdownOptionsForField(realtimeSchema, "language", undefined);
            return base;
        }
        const base = dropdownOptionsForField(languageSchema, "language", languageModelWatch);
        const cur = effectiveLanguageValue;
        if (cur && !base.includes(cur)) {
            return [...base, cur];
        }
        return base;
    }, [
        isRealtime,
        realtimeSchema,
        languageSchema,
        languageModelWatch,
        effectiveLanguageValue,
    ]);

    const disabled = readOnly || isSaving || !userConfig || !schemasReady;
    const missingModelProvider = !modelProviderKey;

    if (!userConfig || !schemasReady) {
        return (
            <div className="flex h-11 shrink-0 items-center border-b bg-muted/20 px-4 text-xs text-muted-foreground">
                Loading model settings…
            </div>
        );
    }

    return (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 sm:flex-nowrap">
                {/* Model */}
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    {missingModelProvider ? (
                        <span className="text-xs text-muted-foreground">No provider</span>
                    ) : modelOptions.length > 0 ? (
                        <Select
                            value={currentModelValue || ""}
                            onValueChange={(v) => void onModelChange(v)}
                            disabled={disabled}
                        >
                            <SelectTrigger className="h-9 w-full min-w-[160px] rounded-lg bg-background">
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                {modelOptions.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                        {opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="truncate text-sm">{currentModelValue || "—"}</span>
                    )}
                </div>

                {/* Voice */}
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Voice</Label>
                    {isRealtime ? (
                        voiceEnumOptions.length > 0 ? (
                            <Select
                                value={realtimeVoice || voiceEnumOptions[0] || ""}
                                onValueChange={(v) => void onVoiceChange(v)}
                                disabled={disabled || !realtimeProvider}
                            >
                                <SelectTrigger className="h-9 w-full min-w-[140px] rounded-lg bg-background">
                                    <SelectValue placeholder="Voice" />
                                </SelectTrigger>
                                <SelectContent>
                                    {voiceEnumOptions.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                            {VOICE_DISPLAY_NAMES[opt] ||
                                                opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className="text-sm">{realtimeVoice || "—"}</span>
                        )
                    ) : ttsProvider ? (
                        voiceEnumOptions.length > 0 ? (
                            <Select
                                value={ttsVoice || ""}
                                onValueChange={(v) => void onVoiceChange(v)}
                                disabled={disabled}
                            >
                                <SelectTrigger className="h-9 w-full min-w-[140px] rounded-lg bg-background">
                                    <SelectValue placeholder="Voice" />
                                </SelectTrigger>
                                <SelectContent>
                                    {voiceEnumOptions.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                            {VOICE_DISPLAY_NAMES[opt] ||
                                                opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : !voiceFieldSchema?.allow_custom_input ? (
                            <VoiceSelector
                                provider={ttsProvider}
                                value={ttsVoice || ""}
                                onChange={(v) => void onVoiceChange(v)}
                                model={ttsModel || undefined}
                                language={ttsLanguage || undefined}
                                className="h-9 w-full min-w-[160px] justify-between rounded-lg border border-input bg-background px-3"
                            />
                        ) : (
                            <span className="text-sm">{ttsVoice || "—"}</span>
                        )
                    ) : (
                        <span className="text-xs text-muted-foreground">No TTS provider</span>
                    )}
                </div>

                {/* Language */}
                <div className="flex min-w-[120px] flex-1 flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Language</Label>
                    {isRealtime ? (
                        realtimeProvider ? (
                            <Select
                                value={
                                    realtimeLanguage == null || realtimeLanguage === ""
                                        ? LANGUAGE_AUTO
                                        : realtimeLanguage
                                }
                                onValueChange={(v) => void onLanguageChange(v)}
                                disabled={disabled}
                            >
                                <SelectTrigger className="h-9 w-full min-w-[120px] rounded-lg bg-background">
                                    <SelectValue placeholder="Language" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={LANGUAGE_AUTO}>Auto-detect</SelectItem>
                                    {languageOptions.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                            {LANGUAGE_DISPLAY_NAMES[opt] || opt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                        )
                    ) : languageProvider && languageOptions.length > 0 ? (
                        <Select
                            value={effectiveLanguageValue || ""}
                            onValueChange={(v) => void onLanguageChange(v)}
                            disabled={disabled}
                        >
                            <SelectTrigger className="h-9 w-full min-w-[120px] rounded-lg bg-background">
                                <SelectValue placeholder="Language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languageOptions.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                        {LANGUAGE_DISPLAY_NAMES[opt] || opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : languageProvider && resolveProperty(languageSchema, "language")?.allow_custom_input ? (
                        <span className="text-xs text-muted-foreground">
                            Set in{" "}
                            <Link
                                href={`/workflow/${workflowId}/settings#models`}
                                className="underline"
                            >
                                settings
                            </Link>
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </div>
            </div>

            <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-lg"
                asChild
            >
                <Link href={`/workflow/${workflowId}/settings#models`} title="Model overrides">
                    <Settings className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Open model overrides in settings</span>
                </Link>
            </Button>
        </div>
    );
}
