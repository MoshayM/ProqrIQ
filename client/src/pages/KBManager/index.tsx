import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Upload, RefreshCw, Trash2, Plus, Edit2, X, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface KBDocument {
  id: string;
  filename: string;
  file_type: string;
  chunk_count: number;
  indexed_at: string | null;
  created_at: string;
}

interface KBEntry {
  id: string;
  title: string;
  content: string;
  commodity_type: string | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
}

interface RegionalRate {
  id: string;
  country_code: string;
  country_name: string;
  currency: string;
  machine_rate_eur_hr: number;
  labour_rate_eur_hr: number;
  overhead_pct: number;
  updated_at: string;
}

const COMMODITY_TYPES = [
  'sheet_metal','cnc_machining','pcb_rigid','pcb_flex','injection_moulding',
  'stamping','die_casting','extrusion','forging','turning','grinding',
  'welding_assembly','other',
];

// ─── DOCUMENTS TAB ───────────────────────────────────────────────────────────

function DocumentsTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery<KBDocument[]>({
    queryKey: ['kb-documents'],
    queryFn: api.kb.documents,
  });

  const uploadMut = useMutation({
    mutationFn: (fd: FormData) => api.kb.uploadDoc(fd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
      toast.success('Document uploaded');
    },
    onError: () => toast.error('Upload failed'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    uploadMut.mutate(fd);
    e.target.value = '';
  }

  async function handleReindex(id: string) {
    setLoadingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await api.kb.reindexDoc(id);
      queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
      toast.success('Document re-indexed');
    } catch { toast.error('Re-index failed'); }
    finally { setLoadingIds((prev) => ({ ...prev, [id]: false })); }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setLoadingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await api.kb.deleteDoc(id);
      queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
      toast.success('Document deleted');
    } catch { toast.error('Delete failed'); }
    finally { setLoadingIds((prev) => ({ ...prev, [id]: false })); }
  }

  const FILE_TYPE_COLORS: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700',
    docx: 'bg-blue-100 text-blue-700',
    xlsx: 'bg-green-100 text-green-700',
    csv: 'bg-emerald-100 text-emerald-700',
    txt: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.txt,.xlsx,.csv"
          onChange={handleFileChange}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
        >
          {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload Document
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" /></div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Upload className="w-10 h-10" />
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-4 font-medium">Filename</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Chunks</th>
                <th className="pb-3 pr-4 font-medium">Indexed At</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-[#1e2d4e] max-w-xs truncate">{doc.filename}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase ${FILE_TYPE_COLORS[doc.file_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {doc.file_type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-600">{doc.chunk_count}</td>
                  <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                    {doc.indexed_at ? format(new Date(doc.indexed_at), 'dd MMM yy HH:mm') : (
                      <span className="text-amber-500 text-xs">Not indexed</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 whitespace-nowrap text-xs">
                    {format(new Date(doc.created_at), 'dd MMM yy')}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleReindex(doc.id)}
                        disabled={loadingIds[doc.id]}
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
                        title="Re-index"
                      >
                        {loadingIds[doc.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(doc.id)}
                        disabled={loadingIds[doc.id]}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-800">Delete Document?</h3>
            <p className="text-sm text-gray-500">This action cannot be undone. The document and its indexed chunks will be permanently removed.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="flex-1">Cancel</Button>
              <Button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 bg-red-600 hover:bg-red-700 text-white">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ENTRIES TAB ─────────────────────────────────────────────────────────────

interface EntryFormData {
  title: string;
  content: string;
  commodity_type: string;
  source: string;
}

function EntryForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial?: Partial<EntryFormData>;
  onSubmit: (data: EntryFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [commodityType, setCommodityType] = useState(initial?.commodity_type ?? '');
  const [source, setSource] = useState(initial?.source ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { toast.error('Title and content are required'); return; }
    onSubmit({ title, content, commodity_type: commodityType, source });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
            placeholder="Entry title"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 resize-none"
            placeholder="Knowledge base content..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Commodity Type</label>
          <select
            value={commodityType}
            onChange={(e) => setCommodityType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            {COMMODITY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. Internal, VDA, etc."
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading} className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-1">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function EntriesTab() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery<KBEntry[]>({
    queryKey: ['kb-entries'],
    queryFn: api.kb.entries,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.kb.createEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      toast.success('Entry created');
      setShowAddForm(false);
    },
    onError: () => toast.error('Failed to create entry'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.kb.updateEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      toast.success('Entry updated');
      setEditingEntry(null);
    },
    onError: () => toast.error('Failed to update entry'),
  });

  async function handleDeactivate(id: string) {
    setDeactivatingId(id);
    try {
      await api.kb.deactivateEntry(id);
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      toast.success('Entry deactivated');
    } catch { toast.error('Failed to deactivate entry'); }
    finally { setDeactivatingId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => { setShowAddForm(true); setEditingEntry(null); }}
          className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Entry
        </Button>
      </div>

      {showAddForm && (
        <EntryForm
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={() => setShowAddForm(false)}
          isLoading={createMut.isPending}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Plus className="w-10 h-10" />
          <p>No entries yet. Add the first knowledge base entry.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-4 font-medium">Title</th>
                <th className="pb-3 pr-4 font-medium">Commodity</th>
                <th className="pb-3 pr-4 font-medium">Source</th>
                <th className="pb-3 pr-4 font-medium">Active</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className={`hover:bg-gray-50 ${!entry.is_active ? 'opacity-60 bg-gray-50' : ''}`}>
                  <td className="py-3 pr-4 font-medium text-[#1e2d4e] max-w-xs truncate">{entry.title}</td>
                  <td className="py-3 pr-4 text-gray-500 capitalize">
                    {entry.commodity_type ? entry.commodity_type.replace(/_/g, ' ') : '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs">{entry.source ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${entry.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {entry.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">
                    {format(new Date(entry.created_at), 'dd MMM yy')}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingEntry(entry); setShowAddForm(false); }}
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {entry.is_active && (
                        <button
                          onClick={() => handleDeactivate(entry.id)}
                          disabled={deactivatingId === entry.id}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-500"
                          title="Deactivate"
                        >
                          {deactivatingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1e2d4e]">Edit Entry</h2>
              <button onClick={() => setEditingEntry(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              <EntryForm
                initial={{
                  title: editingEntry.title,
                  content: editingEntry.content,
                  commodity_type: editingEntry.commodity_type ?? '',
                  source: editingEntry.source ?? '',
                }}
                onSubmit={(data) => updateMut.mutate({ id: editingEntry.id, data })}
                onCancel={() => setEditingEntry(null)}
                isLoading={updateMut.isPending}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RATES TAB ────────────────────────────────────────────────────────────────

function RatesTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<RegionalRate>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRate, setNewRate] = useState({
    country_code: '',
    country_name: '',
    currency: 'EUR',
    machine_rate_eur_hr: 0,
    labour_rate_eur_hr: 0,
    overhead_pct: 0,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const { data: rates = [], isLoading } = useQuery<RegionalRate[]>({
    queryKey: ['kb-rates'],
    queryFn: api.kb.rates,
  });

  async function handleSave() {
    if (!editingId) return;
    setIsSaving(true);
    try {
      await api.kb.updateRate(editingId, editValues);
      queryClient.invalidateQueries({ queryKey: ['kb-rates'] });
      toast.success('Rate updated');
      setEditingId(null);
      setEditValues({});
    } catch { toast.error('Failed to update rate'); }
    finally { setIsSaving(false); }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newRate.country_code.trim() || !newRate.country_name.trim()) {
      toast.error('Country code and name are required');
      return;
    }
    setIsAdding(true);
    try {
      await api.kb.createRate(newRate);
      queryClient.invalidateQueries({ queryKey: ['kb-rates'] });
      toast.success('Rate added');
      setShowAddForm(false);
      setNewRate({ country_code: '', country_name: '', currency: 'EUR', machine_rate_eur_hr: 0, labour_rate_eur_hr: 0, overhead_pct: 0 });
    } catch { toast.error('Failed to add rate'); }
    finally { setIsAdding(false); }
  }

  function startEdit(rate: RegionalRate) {
    setEditingId(rate.id);
    setEditValues({
      machine_rate_eur_hr: rate.machine_rate_eur_hr,
      labour_rate_eur_hr: rate.labour_rate_eur_hr,
      overhead_pct: rate.overhead_pct,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setShowAddForm(true)}
          className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Country
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-3 font-medium">Code</th>
                <th className="pb-3 pr-3 font-medium">Country</th>
                <th className="pb-3 pr-3 font-medium">Currency</th>
                <th className="pb-3 pr-3 font-medium">Machine (€/hr)</th>
                <th className="pb-3 pr-3 font-medium">Labour (€/hr)</th>
                <th className="pb-3 pr-3 font-medium">Overhead %</th>
                <th className="pb-3 pr-3 font-medium">Updated</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rates.map((rate) => (
                <tr key={rate.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-3 font-mono font-semibold text-[#1e2d4e]">{rate.country_code}</td>
                  <td className="py-3 pr-3 font-medium text-gray-700">{rate.country_name}</td>
                  <td className="py-3 pr-3 text-gray-500">{rate.currency}</td>

                  {editingId === rate.id ? (
                    <>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={editValues.machine_rate_eur_hr ?? ''}
                          onChange={(e) => setEditValues((v) => ({ ...v, machine_rate_eur_hr: Number(e.target.value) }))}
                          className="w-24 border rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={editValues.labour_rate_eur_hr ?? ''}
                          onChange={(e) => setEditValues((v) => ({ ...v, labour_rate_eur_hr: Number(e.target.value) }))}
                          className="w-24 border rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.1"
                          value={editValues.overhead_pct ?? ''}
                          onChange={(e) => setEditValues((v) => ({ ...v, overhead_pct: Number(e.target.value) }))}
                          className="w-20 border rounded px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3 text-gray-400 text-xs">—</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="p-1.5 rounded hover:bg-green-50 text-green-600"
                            title="Save"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditValues({}); }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 pr-3 text-gray-700">{rate.machine_rate_eur_hr.toFixed(2)}</td>
                      <td className="py-3 pr-3 text-gray-700">{rate.labour_rate_eur_hr.toFixed(2)}</td>
                      <td className="py-3 pr-3 text-gray-700">{rate.overhead_pct.toFixed(1)}%</td>
                      <td className="py-3 pr-3 text-gray-400 text-xs whitespace-nowrap">
                        {format(new Date(rate.updated_at), 'dd MMM yy')}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => startEdit(rate)}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1e2d4e]">Add Country Rate</h2>
              <button onClick={() => setShowAddForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country Code *</label>
                  <input
                    value={newRate.country_code}
                    onChange={(e) => setNewRate((r) => ({ ...r, country_code: e.target.value.toUpperCase() }))}
                    maxLength={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase"
                    placeholder="DE"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <input
                    value={newRate.currency}
                    onChange={(e) => setNewRate((r) => ({ ...r, currency: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="EUR"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country Name *</label>
                  <input
                    value={newRate.country_name}
                    onChange={(e) => setNewRate((r) => ({ ...r, country_name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Germany"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Machine Rate (€/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newRate.machine_rate_eur_hr}
                    onChange={(e) => setNewRate((r) => ({ ...r, machine_rate_eur_hr: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Labour Rate (€/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newRate.labour_rate_eur_hr}
                    onChange={(e) => setNewRate((r) => ({ ...r, labour_rate_eur_hr: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Overhead %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newRate.overhead_pct}
                    onChange={(e) => setNewRate((r) => ({ ...r, overhead_pct: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isAdding}
                className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold mt-2"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Add Rate
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function KBManager() {
  useRoleGuard(['admin']);
  const [activeTab, setActiveTab] = useState<'documents'|'entries'|'rates'>('documents');

  const TABS = [
    { key: 'documents', label: 'Documents' },
    { key: 'entries', label: 'Entries' },
    { key: 'rates', label: 'Regional Rates' },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2d4e]">Knowledge Base Manager</h1>
        <p className="text-sm text-gray-500 mt-1">Manage documents, entries, and regional rate data used for cost estimation</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex border-b border-gray-200">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-b-2 border-[#e85c1a] text-[#e85c1a]'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'documents' && <DocumentsTab />}
            {activeTab === 'entries' && <EntriesTab />}
            {activeTab === 'rates' && <RatesTab />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
