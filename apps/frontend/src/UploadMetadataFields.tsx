import { Info } from 'lucide-react';
import type { EncodingPreset } from '../../../packages/contracts/src/index';
import React from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { metadataSchema } from '../../../packages/contracts/src/validation';

type Fields = { title: string; description: string };
const resolver: Resolver<Fields> = async values => {
  const parsed = metadataSchema.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) {
    const name = String(issue.path[0]);
    errors[name] ??= { type: issue.code, message: issue.message };
  }
  return { values: {}, errors };
};
export function UploadMetadataFields({ itemKey, title, description, encodingPreset, editable, onChange }: {
  itemKey: string; title: string; description: string; encodingPreset: EncodingPreset; editable: boolean; onChange: (patch: Partial<Fields> & { encodingPreset?: EncodingPreset }) => void;
}) {
  const [showPresetHelp, setShowPresetHelp] = React.useState(false);
  const presetHelpRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (!showPresetHelp) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !presetHelpRef.current?.contains(event.target)) {
        setShowPresetHelp(false);
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [showPresetHelp]);
  const { register, formState: { errors } } = useForm<Fields>({
    defaultValues: { title, description }, resolver, mode: 'onChange',
  });
  const titleField = register('title');
  const descriptionField = register('description');
  return <div>
    <label>Title<input {...titleField} maxLength={200} disabled={!editable}
      aria-invalid={!!errors.title} aria-describedby={errors.title ? `${itemKey}-title-error` : undefined}
      onChange={event => { void titleField.onChange(event); onChange({ title: event.target.value }); }} /></label>
    {errors.title && <p id={`${itemKey}-title-error`} role="alert" className="text-red-300">{errors.title.message}</p>}
    <label>Description (optional)<textarea {...descriptionField} maxLength={5000} disabled={!editable}
      aria-invalid={!!errors.description} aria-describedby={errors.description ? `${itemKey}-description-error` : undefined}
      onChange={event => { void descriptionField.onChange(event); onChange({ description: event.target.value }); }} /></label>
    {errors.description && <p id={`${itemKey}-description-error`} role="alert" className="text-red-300">{errors.description.message}</p>}
    <div className="encoding-preset">
      <div className="encoding-label-row">
      <label htmlFor={`${itemKey}-preset`}>Processing quality</label>
      <span ref={presetHelpRef} className="encoding-help"
        onMouseEnter={() => setShowPresetHelp(true)}
        onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setShowPresetHelp(false); }}
        onFocus={() => setShowPresetHelp(true)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowPresetHelp(false); }}
        onKeyDown={event => { if (event.key === 'Escape') setShowPresetHelp(false); }}>
        <button type="button" className="secondary" aria-label="About processing quality"
          aria-expanded={showPresetHelp} aria-describedby={showPresetHelp ? `${itemKey}-preset-help` : undefined} aria-controls={`${itemKey}-preset-help`}
          onClick={() => setShowPresetHelp(true)}><Info size={16} aria-hidden="true" /></button>
        <span id={`${itemKey}-preset-help`} role="tooltip" hidden={!showPresetHelp} className={`encoding-tip${showPresetHelp ? ' is-open' : ''}`}>
          <strong>Choose how your set is processed</strong>
          <span><b>Standard · 30 fps max</b> — prioritizes smaller output and faster encoding.</span>
          <span><b>Smooth motion · 60 fps max</b> — preserves more motion detail.</span>
          <span className="encoding-tip-note">Lower frame rates stay unchanged. Applied after upload; your original is kept. Upload size is unchanged.</span>
        </span>
      </span>
      </div>
      <select id={`${itemKey}-preset`} value={encodingPreset} disabled={!editable}
        onChange={event => onChange({ encodingPreset: event.target.value as EncodingPreset })}>
        <option value="smooth">Smooth motion — up to 60 fps</option>
        <option value="standard">Standard — up to 30 fps</option>
        <option value="original">Original frame rate — may take longer</option>
      </select>
      <p>Applied after upload. Once uploading starts, this choice is saved for processing and retries.</p>
    </div>
  </div>;
}
