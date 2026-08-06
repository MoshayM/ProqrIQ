import React, { useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

interface ProcessStep {
  step_number: number;
  process_name: string;
  machine?: string | null;
  notes?: string | null;
}

type DimensionKey = 'length_mm' | 'width_mm' | 'height_mm' | 'thickness_mm' | 'diameter_mm';

const TOLERANCE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'IT5', label: 'IT5' },
  { value: 'IT6', label: 'IT6' },
  { value: 'IT7', label: 'IT7' },
  { value: 'IT8', label: 'IT8' },
  { value: 'IT9', label: 'IT9' },
  { value: 'IT10', label: 'IT10' },
];

const COMMODITY_OPTIONS = [
  'sheet_metal', 'cnc_machining', 'pcb_rigid', 'pcb_flex', 'injection_moulding',
  'stamping', 'die_casting', 'extrusion', 'forging', 'turning', 'grinding',
  'welding_assembly', 'other',
];

const commodityLabels: Record<string, string> = {
  sheet_metal: 'Sheet Metal', cnc_machining: 'CNC Machining', pcb_rigid: 'PCB (Rigid)',
  pcb_flex: 'PCB (Flex)', injection_moulding: 'Injection Moulding', stamping: 'Stamping',
  die_casting: 'Die Casting', extrusion: 'Extrusion', forging: 'Forging',
  turning: 'Turning', grinding: 'Grinding', welding_assembly: 'Welding Assembly', other: 'Other',
};

const dimLabels: Record<DimensionKey, string> = {
  length_mm: 'Length',
  width_mm: 'Width',
  height_mm: 'Height',
  thickness_mm: 'Thickness',
  diameter_mm: 'Diameter (Ø)',
};

export default function Step2() {
  const context = useQuoteContext();
  const da = context.drawingAnalysis;

  const [partName, setPartName] = useState(da?.part_name ?? '');
  const [partNumber, setPartNumber] = useState(da?.part_number ?? '');
  const [commodityType, setCommodityType] = useState(da?.commodity_type ?? '');
  const [material, setMaterial] = useState(da?.material_grade ?? '');
  const [primaryProcess, setPrimaryProcess] = useState(da?.manufacturing_process ?? '');
  const [dimensions, setDimensions] = useState<Record<DimensionKey, string>>({
    length_mm: da?.dimensions_json?.length_mm?.toString() ?? '',
    width_mm: da?.dimensions_json?.width_mm?.toString() ?? '',
    height_mm: da?.dimensions_json?.height_mm?.toString() ?? '',
    thickness_mm: da?.dimensions_json?.thickness_mm?.toString() ?? '',
    diameter_mm: da?.dimensions_json?.diameter_mm?.toString() ?? '',
  });
  // net_weight_g stored internally; displayed and edited in grams
  const [weightG, setWeightG] = useState(da?.net_weight_g?.toString() ?? '');
  const [surfaceFinish, setSurfaceFinish] = useState(da?.surface_finish ?? '');
  const [toleranceClass, setToleranceClass] = useState(da?.tolerance_class ?? 'general');
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>(
    da?.inferred_process_steps ?? []
  );
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const markEdited = (field: string) => {
    setEditedFields((prev) => new Set(prev).add(field));
  };

  const updateStep = (index: number, key: keyof ProcessStep, value: string) => {
    setProcessSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: value } : s))
    );
  };

  const addStep = () => {
    setProcessSteps((prev) => [
      ...prev,
      { step_number: prev.length + 1, process_name: '', machine: '', notes: '' },
    ]);
  };

  const removeStep = (index: number) => {
    setProcessSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );
  };

  const handleConfirm = async () => {
    if (!context.partId || !context.quotationId) {
      toast.error('Missing part or quote ID. Please restart the wizard.');
      return;
    }
    setIsSaving(true);
    try {
      const dimPayload: Record<string, number> = {};
      (['length_mm', 'width_mm', 'height_mm', 'thickness_mm', 'diameter_mm'] as DimensionKey[]).forEach((k) => {
        const v = parseFloat(dimensions[k]);
        if (!isNaN(v)) dimPayload[k] = v;
      });

      const updatedPart = await api.parts.update(context.partId, {
        name: partName,
        part_number: partNumber || undefined,
        commodity_type: commodityType,
        material_grade: material || undefined,
        manufacturing_process: primaryProcess || undefined,
        dimensions_json: Object.keys(dimPayload).length > 0 ? dimPayload : undefined,
        net_weight_g: weightG ? parseFloat(weightG) : undefined,
      });

      await api.quotes.update(context.quotationId, {
        inferred_process_steps: processSteps,
        surface_finish: surfaceFinish || undefined,
        tolerance_class: toleranceClass,
      });

      const updatedAnalysis = {
        ...(da || {
          part_name: partName,
          commodity_type: commodityType,
          material_grade: material,
          dimensions_json: dimPayload,
          manufacturing_process: primaryProcess,
          inferred_process_steps: processSteps,
          confidence_score: 100,
        }),
        part_name: partName,
        part_number: partNumber || undefined,
        commodity_type: commodityType,
        material_grade: material,
        manufacturing_process: primaryProcess,
        dimensions_json: dimPayload,
        net_weight_g: weightG ? parseFloat(weightG) : undefined,
        surface_finish: surfaceFinish || undefined,
        tolerance_class: toleranceClass,
        inferred_process_steps: processSteps,
      };
      context.setDrawingAnalysis(updatedAnalysis as any);
      toast.success('Geometry confirmed!');
      context.setStep(3);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save geometry.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent ${
      editedFields.has(field) ? 'border-[#e85c1a]' : 'border-gray-300'
    }`;

  const fieldLabel = (label: string, field: string, required = false) => (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {editedFields.has(field) && (
        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#e85c1a] align-middle" />
      )}
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1e2d4e]">Review Geometry</h2>
        <p className="text-gray-500 mt-1">Confirm or correct the extracted part data before proceeding.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-[#1e2d4e] mb-4">Part Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {fieldLabel('Part Name', 'partName', true)}
              <input
                type="text"
                value={partName}
                onChange={(e) => { setPartName(e.target.value); markEdited('partName'); }}
                className={inputClass('partName')}
              />
            </div>
            <div>
              {fieldLabel('Part Number', 'partNumber')}
              <input
                type="text"
                value={partNumber}
                onChange={(e) => { setPartNumber(e.target.value); markEdited('partNumber'); }}
                className={inputClass('partNumber')}
              />
            </div>
            <div>
              {fieldLabel('Commodity Type', 'commodityType')}
              <select
                value={commodityType}
                onChange={(e) => { setCommodityType(e.target.value); markEdited('commodityType'); }}
                className={inputClass('commodityType')}
              >
                <option value="">Select...</option>
                {COMMODITY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{commodityLabels[c]}</option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel('Material Grade', 'material')}
              <input
                type="text"
                value={material}
                onChange={(e) => { setMaterial(e.target.value); markEdited('material'); }}
                className={inputClass('material')}
              />
            </div>
            <div>
              {fieldLabel('Manufacturing Process', 'primaryProcess')}
              <input
                type="text"
                value={primaryProcess}
                onChange={(e) => { setPrimaryProcess(e.target.value); markEdited('primaryProcess'); }}
                className={inputClass('primaryProcess')}
              />
            </div>
            <div>
              {fieldLabel('Tolerance Class', 'toleranceClass')}
              <select
                value={toleranceClass}
                onChange={(e) => { setToleranceClass(e.target.value); markEdited('toleranceClass'); }}
                className={inputClass('toleranceClass')}
              >
                {TOLERANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel('Surface Finish', 'surfaceFinish')}
              <input
                type="text"
                value={surfaceFinish}
                onChange={(e) => { setSurfaceFinish(e.target.value); markEdited('surfaceFinish'); }}
                placeholder="e.g. Ra 1.6, Anodised"
                className={inputClass('surfaceFinish')}
              />
            </div>
            <div>
              {fieldLabel('Net Weight (g)', 'weightG')}
              <input
                type="number"
                value={weightG}
                onChange={(e) => { setWeightG(e.target.value); markEdited('weightG'); }}
                step="0.001"
                min="0"
                className={inputClass('weightG')}
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Dimensions (mm)</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(['length_mm', 'width_mm', 'height_mm', 'thickness_mm', 'diameter_mm'] as DimensionKey[]).map((dim) => (
                <div key={dim}>
                  <label className="block text-xs text-gray-500 mb-1 capitalize">
                    {dimLabels[dim]}
                    {editedFields.has(`dim_${dim}`) && (
                      <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#e85c1a] align-middle" />
                    )}
                  </label>
                  <input
                    type="number"
                    value={dimensions[dim]}
                    onChange={(e) => {
                      setDimensions((prev) => ({ ...prev, [dim]: e.target.value }));
                      markEdited(`dim_${dim}`);
                    }}
                    step="0.01"
                    min="0"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent ${
                      editedFields.has(`dim_${dim}`) ? 'border-[#e85c1a]' : 'border-gray-300'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Process Steps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#1e2d4e]">Process Steps</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={addStep}
              className="text-[#e85c1a] border-[#e85c1a] hover:bg-orange-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Step
            </Button>
          </div>

          {processSteps.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No process steps defined. Click "Add Step" to add one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-2 text-left text-gray-500 font-medium w-10">#</th>
                    <th className="py-2 px-2 text-left text-gray-500 font-medium">Process Name</th>
                    <th className="py-2 px-2 text-left text-gray-500 font-medium">Machine</th>
                    <th className="py-2 px-2 text-left text-gray-500 font-medium">Notes</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {processSteps.map((step, index) => (
                    <tr key={index}>
                      <td className="py-2 px-2 text-gray-400">{step.step_number}</td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={step.process_name}
                          onChange={(e) => updateStep(index, 'process_name', e.target.value)}
                          placeholder="e.g. Laser Cut"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85c1a]"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={step.machine || ''}
                          onChange={(e) => updateStep(index, 'machine', e.target.value)}
                          placeholder="e.g. Trumpf 3000"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85c1a]"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={step.notes || ''}
                          onChange={(e) => updateStep(index, 'notes', e.target.value)}
                          placeholder="Optional notes"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#e85c1a]"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeStep(index)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editedFields.size > 0 && (
        <div className="flex items-center gap-2 text-sm text-[#e85c1a]">
          <span className="inline-block w-2 h-2 rounded-full bg-[#e85c1a]" />
          {editedFields.size} field{editedFields.size !== 1 ? 's' : ''} edited
        </div>
      )}

      <Button
        onClick={handleConfirm}
        disabled={isSaving || !partName.trim()}
        className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-12 text-base font-semibold disabled:opacity-50"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Confirm & Continue'
        )}
      </Button>
    </div>
  );
}
