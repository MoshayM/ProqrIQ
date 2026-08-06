import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import type { DrawingAnalysisResult } from '@shared/types';

const commodityLabels: Record<string, string> = {
  sheet_metal: 'Sheet Metal',
  cnc_machining: 'CNC Machining',
  pcb_rigid: 'PCB (Rigid)',
  pcb_flex: 'PCB (Flex)',
  injection_moulding: 'Injection Moulding',
  stamping: 'Stamping',
  die_casting: 'Die Casting',
  extrusion: 'Extrusion',
  forging: 'Forging',
  turning: 'Turning',
  grinding: 'Grinding',
  welding_assembly: 'Welding Assembly',
  other: 'Other',
};

const commodityEmojis: Record<string, string> = {
  sheet_metal: '🔧',
  cnc_machining: '⚙️',
  pcb_rigid: '🖥️',
  pcb_flex: '📱',
  injection_moulding: '🏭',
  stamping: '🔨',
  die_casting: '🪝',
  extrusion: '📏',
  forging: '⚒️',
  turning: '🔩',
  grinding: '💎',
  welding_assembly: '🔗',
  other: '📦',
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDimensions = (dims: DrawingAnalysisResult['dimensions_json']): string => {
  if (!dims) return '—';
  const parts: string[] = [];
  if (dims.l_mm) parts.push(`L: ${dims.l_mm}mm`);
  if (dims.w_mm) parts.push(`W: ${dims.w_mm}mm`);
  if (dims.h_mm) parts.push(`H: ${dims.h_mm}mm`);
  if (dims.thickness_mm) parts.push(`T: ${dims.thickness_mm}mm`);
  if (dims.diameter_mm) parts.push(`Ø: ${dims.diameter_mm}mm`);
  if (dims.depth_mm) parts.push(`D: ${dims.depth_mm}mm`);
  return parts.join(', ') || '—';
};

interface ManualFormState {
  name: string;
  part_number: string;
  material: string;
  primary_process: string;
}

export default function Step1() {
  const context = useQuoteContext();
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DrawingAnalysisResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualFormState>({
    name: '',
    part_number: '',
    material: '',
    primary_process: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((selectedFile: File) => {
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit.');
      return;
    }
    setFile(selectedFile);
    setAnalysisResult(null);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFileChange(selected);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileChange(dropped);
  };

  const handleAnalyse = async () => {
    if (!file) return;
    setIsAnalysing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.ai.analyseDrawing(formData);
      setAnalysisResult(result);
      context.setDrawingFile(file);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to analyse drawing. Please try again.');
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleCreateFromAnalysis = async () => {
    if (!analysisResult) return;
    setIsCreating(true);
    try {
      const part = await api.parts.create({
        part_name: analysisResult.part_name,
        part_number: analysisResult.part_number,
        commodity_type: analysisResult.commodity_type,
        material_grade: analysisResult.material_grade,
        manufacturing_process: analysisResult.manufacturing_process,
        dimensions_json: analysisResult.dimensions_json,
        net_weight_g: analysisResult.net_weight_g,
        surface_finish: analysisResult.surface_finish,
        tolerance_class: analysisResult.tolerance_class,
      });
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' });
      context.setPartId(part.id);
      context.setQuotationId(quote.id);
      context.setDrawingAnalysis(analysisResult);
      toast.success('Drawing analysed! Moving to geometry review.');
      context.setStep(2);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create quote draft.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateManual = async () => {
    if (!selectedCommodity || !manualForm.name.trim()) {
      toast.error('Please enter a part name.');
      return;
    }
    setIsCreating(true);
    try {
      const part = await api.parts.create({
        part_name: manualForm.name,
        part_number: manualForm.part_number || undefined,
        commodity_type: selectedCommodity,
        material_grade: manualForm.material || undefined,
        manufacturing_process: manualForm.primary_process || undefined,
      });
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' });
      context.setPartId(part.id);
      context.setQuotationId(quote.id);
      context.setStep(2);
      toast.success('Quote draft created!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create quote draft.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1e2d4e]">New Quote</h2>
        <p className="text-gray-500 mt-1">Upload an engineering drawing or enter part details manually.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setMode('upload')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            mode === 'upload'
              ? 'border-[#e85c1a] text-[#e85c1a]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload Drawing
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            mode === 'manual'
              ? 'border-[#e85c1a] text-[#e85c1a]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Enter Manually
        </button>
      </div>

      {mode === 'upload' && (
        <div className="space-y-4">
          {/* Upload zone */}
          {!file && !isAnalysing && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                ${isDragging ? 'border-[#e85c1a] bg-orange-50' : 'border-gray-300 hover:border-gray-400 bg-white'}
              `}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium mb-1">Drop your engineering drawing here</p>
              <p className="text-[#e85c1a] text-sm mb-3">or click to browse</p>
              <p className="text-gray-400 text-sm">Supports PDF, PNG, JPG, WEBP • Max 50MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          )}

          {/* File selected - show info + analyse button */}
          {file && !isAnalysing && !analysisResult && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="w-8 h-8 text-[#1e2d4e] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <Button
                  onClick={handleAnalyse}
                  className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white"
                >
                  Analyse Drawing
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {isAnalysing && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-12 h-12 text-[#e85c1a] animate-spin" />
              <p className="text-gray-600 font-medium">Analysing drawing with AI...</p>
              <p className="text-gray-400 text-sm">This may take a few seconds</p>
            </div>
          )}

          {/* Analysis result */}
          {analysisResult && !isAnalysing && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-[#1e2d4e]">{analysisResult.part_name}</h3>
                      {analysisResult.part_number && (
                        <p className="text-gray-500 text-sm mt-0.5">#{analysisResult.part_number}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-[#1e2d4e] text-white text-xs rounded-full font-medium">
                        {(analysisResult.commodity_type && commodityLabels[analysisResult.commodity_type]) || analysisResult.commodity_type || '—'}
                      </span>
                      <span
                        className={`px-3 py-1 text-xs rounded-full font-medium ${
                          analysisResult.confidence_score >= 80
                            ? 'bg-green-100 text-green-800'
                            : analysisResult.confidence_score >= 60
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {analysisResult.confidence_score}% confidence
                      </span>
                    </div>
                  </div>

                  <table className="w-full text-sm mb-4">
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-2 text-gray-500 w-1/3">Material</td>
                        <td className="py-2 font-medium">{analysisResult.material_grade || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-500">Primary Process</td>
                        <td className="py-2 font-medium">{analysisResult.manufacturing_process || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-500">Dimensions</td>
                        <td className="py-2 font-medium">{formatDimensions(analysisResult.dimensions_json)}</td>
                      </tr>
                      {analysisResult.surface_finish && (
                        <tr>
                          <td className="py-2 text-gray-500">Surface Finish</td>
                          <td className="py-2 font-medium">{analysisResult.surface_finish}</td>
                        </tr>
                      )}
                      {analysisResult.net_weight_g != null && (
                        <tr>
                          <td className="py-2 text-gray-500">Weight</td>
                          <td className="py-2 font-medium">{(analysisResult.net_weight_g / 1000).toFixed(3)} kg</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {analysisResult.inferred_process_steps.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Process Steps</p>
                      <ol className="space-y-1">
                        {analysisResult.inferred_process_steps.map((step) => (
                          <li key={step.step_number} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1e2d4e] text-white text-xs flex items-center justify-center mt-0.5">
                              {step.step_number}
                            </span>
                            <span>
                              <span className="font-medium">{step.process_name}</span>
                              {step.machine_model && <span className="text-gray-500"> — {step.machine_model}</span>}
                              {step.notes && <span className="text-gray-400 italic"> ({step.notes})</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <Button
                    onClick={handleCreateFromAnalysis}
                    disabled={isCreating}
                    className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-12 text-base font-semibold"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Draft...
                      </>
                    ) : (
                      'Create Draft Quote'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-[#1e2d4e]">Select Commodity Type</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(commodityLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedCommodity(key)}
                className={`p-4 rounded-xl border-2 text-center transition-all hover:border-[#e85c1a] hover:bg-orange-50
                  ${selectedCommodity === key ? 'border-[#e85c1a] bg-orange-50' : 'border-gray-200 bg-white'}
                `}
              >
                <div className="text-2xl mb-1">{commodityEmojis[key]}</div>
                <p className="text-xs font-medium text-gray-700 leading-tight">{label}</p>
              </button>
            ))}
          </div>

          {selectedCommodity && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h4 className="font-semibold text-[#1e2d4e]">
                  {commodityLabels[selectedCommodity]} — Part Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Part Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualForm.name}
                      onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Bracket Assembly"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Part Number</label>
                    <input
                      type="text"
                      value={manualForm.part_number}
                      onChange={(e) => setManualForm((f) => ({ ...f, part_number: e.target.value }))}
                      placeholder="e.g. PN-10042"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                    <input
                      type="text"
                      value={manualForm.material}
                      onChange={(e) => setManualForm((f) => ({ ...f, material: e.target.value }))}
                      placeholder="e.g. Stainless Steel 304"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary Process</label>
                    <input
                      type="text"
                      value={manualForm.primary_process}
                      onChange={(e) => setManualForm((f) => ({ ...f, primary_process: e.target.value }))}
                      placeholder="e.g. Laser Cutting"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateManual}
                  disabled={isCreating || !manualForm.name.trim()}
                  className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-11 font-semibold disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Draft...
                    </>
                  ) : (
                    'Create Draft Quote'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
