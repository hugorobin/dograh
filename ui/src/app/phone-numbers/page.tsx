"use client";

import { Copy, ExternalLink, Pencil, Phone, Plus, Save, Trash2, Webhook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
    createPhoneNumberApiV1PhoneNumbersPost,
    deletePhoneNumberApiV1PhoneNumbersPhoneNumberIdDelete,
    getWorkflowsApiV1WorkflowFetchGet,
    listPhoneNumbersApiV1PhoneNumbersGet,
    updatePhoneNumberApiV1PhoneNumbersPhoneNumberIdPatch,
} from "@/client/sdk.gen";
import type { PhoneNumberResponse } from "@/client/types.gen";
import { useAuth } from "@/lib/auth";

function errorDetail(err: unknown): string {
    if (err && typeof err === "object" && "detail" in err) {
        const d = (err as { detail?: unknown }).detail;
        if (typeof d === "string") return d;
    }
    return "Request failed";
}

interface WorkflowOption {
    id: number;
    name: string;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-1">No phone numbers yet</h2>
            <p className="text-muted-foreground text-sm max-w-sm mb-6">
                Connect your SIP trunk numbers here and assign a voice agent to each one.
                Optionally configure a pre-connect webhook per number.
            </p>
            <Button onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Connect a Number
            </Button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Phone number card
// ---------------------------------------------------------------------------

function PhoneNumberCard({
    entry,
    workflows,
    onEdit,
    onDelete,
}: {
    entry: PhoneNumberResponse;
    workflows: WorkflowOption[];
    onEdit: (entry: PhoneNumberResponse) => void;
    onDelete: (id: number) => void;
}) {
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-base font-semibold">
                            {entry.name || entry.e164}
                        </CardTitle>
                        {entry.name && (
                            <p className="text-sm text-muted-foreground font-mono">{entry.e164}</p>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(entry)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(entry.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Inbound Agent */}
                <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {entry.workflow_name ? (
                        <Badge variant="secondary" className="text-xs font-normal">
                            {entry.workflow_name}
                        </Badge>
                    ) : (
                        <span className="text-xs text-muted-foreground italic">No agent assigned</span>
                    )}
                </div>

                {/* Inbound URL */}
                {entry.inbound_url && (
                    <div className="flex items-center gap-2 group">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-xs">
                            {entry.inbound_url}
                        </code>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(entry.inbound_url!)}
                        >
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {/* Per-number inbound webhook */}
                {entry.inbound_webhook_url && (
                    <div className="flex items-center gap-2 group">
                        <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-xs">
                            {entry.inbound_webhook_url}
                        </code>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyToClipboard(entry.inbound_webhook_url!)}
                        >
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {/* SIP trunking info */}
                {entry.termination_uri && (
                    <div className="pt-1 border-t space-y-1.5">
                        <div className="flex items-center gap-2 group">
                            <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Termination</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                                {entry.termination_uri}
                            </code>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyToClipboard(entry.termination_uri!)}
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                        {entry.sip_username && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">SIP User</span>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{entry.sip_username}</code>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">Transport</span>
                            <Badge variant="outline" className="text-xs font-mono">
                                {entry.outbound_transport || "TCP"}
                            </Badge>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Edit / create dialog
// ---------------------------------------------------------------------------

const NO_WORKFLOW = "__none__";

const TRANSPORT_OPTIONS = ["TCP", "UDP", "TLS", "SRTP"] as const;
type TransportOption = (typeof TRANSPORT_OPTIONS)[number];

interface EditDialogProps {
    open: boolean;
    entry: PhoneNumberResponse | null; // null → create mode
    workflows: WorkflowOption[];
    onClose: () => void;
    onSave: (
        data: {
            e164?: string;
            name: string;
            workflow_id: number | null;
            inbound_webhook_url: string;
            termination_uri: string;
            sip_username: string;
            sip_password: string;
            outbound_transport: string;
        },
        entryId?: number
    ) => Promise<void>;
}

function EditDialog({ open, entry, workflows, onClose, onSave }: EditDialogProps) {
    const isCreate = entry === null;
    const [e164, setE164] = useState("");
    const [name, setName] = useState("");
    const [workflowId, setWorkflowId] = useState<string>(NO_WORKFLOW);
    const [webhookUrl, setWebhookUrl] = useState("");
    const [terminationUri, setTerminationUri] = useState("");
    const [sipUsername, setSipUsername] = useState("");
    const [sipPassword, setSipPassword] = useState("");
    const [outboundTransport, setOutboundTransport] = useState<TransportOption>("TCP");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setE164(entry?.e164 ?? "");
        setName(entry?.name ?? "");
        setWorkflowId(entry?.workflow_id != null ? String(entry.workflow_id) : NO_WORKFLOW);
        setWebhookUrl(entry?.inbound_webhook_url ?? "");
        setTerminationUri(entry?.termination_uri ?? "");
        setSipUsername(entry?.sip_username ?? "");
        setSipPassword("");
        setOutboundTransport((entry?.outbound_transport as TransportOption) ?? "TCP");
    }, [open, entry]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(
                {
                    ...(isCreate ? { e164: e164.trim() } : {}),
                    name: name.trim(),
                    workflow_id: workflowId === NO_WORKFLOW ? null : Number(workflowId),
                    inbound_webhook_url: webhookUrl.trim(),
                    termination_uri: terminationUri.trim(),
                    sip_username: sipUsername.trim(),
                    sip_password: sipPassword.trim(),
                    outbound_transport: outboundTransport,
                },
                entry?.id
            );
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isCreate ? "Connect a phone number" : "Edit Phone Number"}</DialogTitle>
                    <DialogDescription>
                        {isCreate
                            ? "Register a DID via SIP trunking and assign a voice agent."
                            : "Update agent assignment, SIP trunking settings, or pre-connect webhook."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* ── Phone number ── */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="e164">Phone Number</Label>
                            <span className="text-xs text-muted-foreground">Format: E.164</span>
                        </div>
                        <Input
                            id="e164"
                            placeholder="+14155552671"
                            value={e164}
                            onChange={(e) => setE164(e.target.value)}
                            autoComplete="tel"
                            disabled={!isCreate}
                        />
                        {isCreate && (
                            <p className="text-xs text-muted-foreground">
                                Must match exactly what your carrier sends as the called number.
                            </p>
                        )}
                    </div>

                    {/* ── Termination URI ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="termination-uri">Termination URI</Label>
                        <Input
                            id="termination-uri"
                            placeholder="sip.yoursiptrunk.com"
                            value={terminationUri}
                            onChange={(e) => setTerminationUri(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            The SIP URI of your trunk (not the Dograh SIP server URI).
                        </p>
                    </div>

                    {/* ── SIP credentials ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="sip-username">
                            SIP Trunk User Name{" "}
                            <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                            id="sip-username"
                            placeholder="Enter SIP Trunk User Name"
                            value={sipUsername}
                            onChange={(e) => setSipUsername(e.target.value)}
                            autoComplete="username"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="sip-password">
                            SIP Trunk Password{" "}
                            <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                            id="sip-password"
                            type="password"
                            placeholder={isCreate ? "Enter SIP Trunk Password" : "Leave blank to keep existing"}
                            value={sipPassword}
                            onChange={(e) => setSipPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    {/* ── Nickname / display name ── */}
                    <div className="space-y-1.5">
                        <Label htmlFor="name">
                            Nickname{" "}
                            <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                            id="name"
                            placeholder="Enter Nickname"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* ── Outbound transport + Agent ── */}
                    <div className="flex gap-4">
                        <div className="space-y-1.5 flex-1">
                            <Label>Outbound Transport</Label>
                            <Select
                                value={outboundTransport}
                                onValueChange={(v) => setOutboundTransport(v as TransportOption)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TRANSPORT_OPTIONS.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5 flex-[2]">
                            <Label>Voice Agent</Label>
                            <Select value={workflowId} onValueChange={setWorkflowId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="None (disable inbound)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_WORKFLOW}>None (disable inbound)</SelectItem>
                                    {workflows.map((wf) => (
                                        <SelectItem key={wf.id} value={String(wf.id)}>
                                            {wf.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* ── Optional pre-connect webhook ── */}
                    <Separator />
                    <div className="space-y-1.5">
                        <Label htmlFor="webhook">
                            Inbound Webhook URL{" "}
                            <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                            id="webhook"
                            type="url"
                            placeholder="https://your-server.com/inbound-hook"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Called before the agent answers. Response can set{" "}
                            <code className="bg-muted px-0.5 rounded">dynamic_variables</code> or
                            override the agent.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving || (isCreate && !e164.trim())}>
                        <Save className="h-4 w-4 mr-1" />
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PhoneNumbersPage() {
    const { user, getAccessToken, loading: authLoading } = useAuth();
    const hasFetched = useRef(false);

    const [phones, setPhones] = useState<PhoneNumberResponse[]>([]);
    const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editEntry, setEditEntry] = useState<PhoneNumberResponse | null>(null);

    // Fetch data
    useEffect(() => {
        if (authLoading || !user || hasFetched.current) return;
        hasFetched.current = true;

        const load = async () => {
            try {
                const token = await getAccessToken();
                const headers = { Authorization: `Bearer ${token}` };
                const [phoneRes, workflowRes] = await Promise.all([
                    listPhoneNumbersApiV1PhoneNumbersGet({ headers }),
                    getWorkflowsApiV1WorkflowFetchGet({ headers }),
                ]);
                if (phoneRes.error) {
                    toast.error(errorDetail(phoneRes.error));
                } else if (phoneRes.data) {
                    setPhones(phoneRes.data);
                }
                if (workflowRes.error) {
                    toast.error("Failed to load workflows");
                } else if (workflowRes.data) {
                    setWorkflows(
                        workflowRes.data
                            .filter((w) => w.status !== "archived")
                            .map((w) => ({ id: w.id, name: w.name }))
                    );
                }
            } catch {
                toast.error("Failed to load phone numbers");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [authLoading, user, getAccessToken]);

    const openCreate = () => {
        setEditEntry(null);
        setDialogOpen(true);
    };

    const openEdit = (entry: PhoneNumberResponse) => {
        setEditEntry(entry);
        setDialogOpen(true);
    };

    const handleSave = async (
        data: {
            e164?: string;
            name: string;
            workflow_id: number | null;
            inbound_webhook_url: string;
            termination_uri: string;
            sip_username: string;
            sip_password: string;
            outbound_transport: string;
        },
        entryId?: number
    ) => {
        const token = await getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };
        if (entryId === undefined) {
            const res = await createPhoneNumberApiV1PhoneNumbersPost({
                headers,
                body: {
                    e164: data.e164!,
                    name: data.name || null,
                    workflow_id: data.workflow_id,
                    inbound_webhook_url: data.inbound_webhook_url || null,
                    termination_uri: data.termination_uri || null,
                    sip_username: data.sip_username || null,
                    sip_password: data.sip_password || null,
                    outbound_transport: data.outbound_transport || "TCP",
                },
            });
            if (res.error) {
                throw new Error(errorDetail(res.error));
            }
            if (res.data) {
                setPhones((prev) => [...prev, res.data]);
                toast.success("Phone number added");
            }
        } else {
            const res = await updatePhoneNumberApiV1PhoneNumbersPhoneNumberIdPatch({
                headers,
                path: { phone_number_id: entryId },
                body: {
                    name: data.name || null,
                    workflow_id: data.workflow_id,
                    clear_workflow: data.workflow_id === null,
                    inbound_webhook_url: data.inbound_webhook_url || null,
                    clear_webhook: !data.inbound_webhook_url,
                    termination_uri: data.termination_uri || null,
                    clear_termination_uri: !data.termination_uri,
                    sip_username: data.sip_username || null,
                    sip_password: data.sip_password || null,
                    clear_sip_credentials: !data.sip_username && !data.sip_password,
                    outbound_transport: data.outbound_transport || "TCP",
                },
            });
            if (res.error) {
                throw new Error(errorDetail(res.error));
            }
            if (res.data) {
                setPhones((prev) => prev.map((p) => (p.id === entryId ? res.data! : p)));
                toast.success("Phone number updated");
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Remove this phone number?")) return;
        try {
            const token = await getAccessToken();
            const res = await deletePhoneNumberApiV1PhoneNumbersPhoneNumberIdDelete({
                headers: { Authorization: `Bearer ${token}` },
                path: { phone_number_id: id },
            });
            if (res.error) {
                toast.error(errorDetail(res.error));
                return;
            }
            setPhones((prev) => prev.filter((p) => p.id !== id));
            toast.success("Phone number removed");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Phone Numbers</h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Connect your SIP trunk numbers and assign a voice agent to each one.
                        </p>
                    </div>
                    {phones.length > 0 && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4 mr-2" />
                            Connect a Number
                        </Button>
                    )}
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="animate-pulse h-36 bg-muted/30" />
                        ))}
                    </div>
                ) : phones.length === 0 ? (
                    <EmptyState onAdd={openCreate} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {phones.map((p) => (
                            <PhoneNumberCard
                                key={p.id}
                                entry={p}
                                workflows={workflows}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>

            <EditDialog
                open={dialogOpen}
                entry={editEntry}
                workflows={workflows}
                onClose={() => setDialogOpen(false)}
                onSave={handleSave}
            />
        </div>
    );
}
