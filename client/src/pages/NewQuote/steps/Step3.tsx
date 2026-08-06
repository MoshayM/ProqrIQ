import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

const schema = z.object({
  supplier_country: z.string().min(1, 'Required'),
  supplier_currency: z.string().min(1, 'Required'),
  annual_volume: z.coerce.number().min(1, 'Must be at least 1'),
  lot_size: z.coerce.number().min(1, 'Must be at least 1'),
  lots_per_year: z.coerce.number().min(1, 'Must be at least 1'),
  shifts_per_day: z.coerce.number().min(1, 'Minimum 1').max(3, 'Maximum 3'),
  annual_production_hours: z.coerce.number().min(1, 'Must be at least 1'),
  procurement_type: z.enum(['purchased', 'in_house', 'sub_contracted']),
  current_cart_price: z.coerce.number().optional(),
  target_cart_price: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

const COUNTRIES = [
  'Germany', 'China', 'India', 'USA', 'Vietnam', 'Thailand', 'Mexico',
  'Poland', 'Romania', 'Czech Republic', 'Other',
];

const CURRENCIES = ['EUR', 'USD', 'CNY', 'INR', 'THB', 'VND', 'MXN', 'PLN', 'RON', 'CZK'];

const PROCUREMENT_OPTIONS = [
  { value: 'in_house', label: 'In House' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'sub_contracted', label: 'Sub Contracted' },
];

export default function Step3() {
  const context = useQuoteContext();
  const pp = context.productionParams;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_country: (pp.supplier_country as string) || 'Germany',
      supplier_currency: (pp.supplier_currency as string) || 'EUR',
      annual_volume: pp.annual_volume || 10000,
      lot_size: pp.lot_size || 500,
      lots_per_year: pp.lots_per_year || 20,
      shifts_per_day: pp.shifts_per_day || 1,
      annual_production_hours: pp.annual_production_hours || 2000,
      procurement_type: (pp.procurement_type as any) || 'in_house',
      current_cart_price: pp.current_cart_price || undefined,
      target_cart_price: pp.target_cart_price || undefined,
    },
  });

  const selectedProcurement = watch('procurement_type');

  const onSubmit = async (values: FormValues) => {
    try {
      await api.quotes.update(context.quotationId!, { production_params: values });
      context.setProductionParams(values);
      toast.success('Production parameters saved!');
      context.setStep(4);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save production parameters.');
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent ${
      hasError ? 'border-red-400' : 'border-gray-300'
    }`;

  const FieldError = ({ name }: { name: keyof typeof errors }) =>
    errors[name] ? (
      <p className="text-xs text-red-500 mt-1">{errors[name]?.message as string}</p>
    ) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1e2d4e]">Production Parameters</h2>
        <p className="text-gray-500 mt-1">Set supply chain and volume parameters for cost estimation.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1: Supply & Currency */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-4">Supply & Currency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Country</label>
                <select {...register('supplier_country')} className={inputClass(!!errors.supplier_country)}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <FieldError name="supplier_country" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Currency</label>
                <select {...register('supplier_currency')} className={inputClass(!!errors.supplier_currency)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <FieldError name="supplier_currency" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Volume & Batch */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-4">Volume & Batch</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Volume (units)</label>
                <input
                  type="number"
                  min="1"
                  {...register('annual_volume')}
                  className={inputClass(!!errors.annual_volume)}
                />
                <FieldError name="annual_volume" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lot Size (units)</label>
                <input
                  type="number"
                  min="1"
                  {...register('lot_size')}
                  className={inputClass(!!errors.lot_size)}
                />
                <FieldError name="lot_size" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lots per Year</label>
                <input
                  type="number"
                  min="1"
                  {...register('lots_per_year')}
                  className={inputClass(!!errors.lots_per_year)}
                />
                <FieldError name="lots_per_year" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shifts per Day</label>
                <input
                  type="number"
                  min="1"
                  max="3"
                  {...register('shifts_per_day')}
                  className={inputClass(!!errors.shifts_per_day)}
                />
                <FieldError name="shifts_per_day" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Production Hours</label>
                <input
                  type="number"
                  min="1"
                  {...register('annual_production_hours')}
                  className={inputClass(!!errors.annual_production_hours)}
                />
                <FieldError name="annual_production_hours" />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Procurement Type</label>
              <div className="flex flex-wrap gap-3">
                {PROCUREMENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedProcurement === opt.value
                        ? 'border-[#e85c1a] bg-orange-50 text-[#e85c1a]'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      {...register('procurement_type')}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
              {errors.procurement_type && (
                <p className="text-xs text-red-500 mt-1">{errors.procurement_type.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Pricing (Optional) */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-1">Pricing (Optional)</h3>
            <p className="text-sm text-gray-500 mb-4">Enter existing prices to benchmark against the AI estimate.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Cart Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 12.50"
                  {...register('current_cart_price')}
                  className={inputClass(!!errors.current_cart_price)}
                />
                <FieldError name="current_cart_price" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Cart Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 9.99"
                  {...register('target_cart_price')}
                  className={inputClass(!!errors.target_cart_price)}
                />
                <FieldError name="target_cart_price" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-12 text-base font-semibold disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save & Continue to Estimate'
          )}
        </Button>
      </form>
    </div>
  );
}
