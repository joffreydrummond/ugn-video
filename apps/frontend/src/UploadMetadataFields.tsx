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
export function UploadMetadataFields({ itemKey, title, description, editable, onChange }: {
  itemKey: string; title: string; description: string; editable: boolean; onChange: (patch: Partial<Fields>) => void;
}) {
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
  </div>;
}
