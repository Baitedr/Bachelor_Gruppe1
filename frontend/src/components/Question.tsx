import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type QuestionType = 'open_text' | 'single_choice';

type QuestionOption = {
  id: string;
  text: string;
};

type QuestionData = {
  id: string | number;
  prompt: string;
  type: QuestionType;
  options: QuestionOption[];
  required: boolean;
  createdAt: string;
};

type Props = {
  initialData?: Partial<QuestionData> | null;
  onSave: (question: QuestionData) => void;
  onCancel?: () => void;
};

export default function Question({ initialData = null, onSave, onCancel }: Props) {
  const [prompt, setPrompt] = useState(initialData?.prompt || '');
  const [questionType, setQuestionType] = useState<QuestionType>(initialData?.type ?? 'open_text');
  const [isRequired, setIsRequired] = useState(Boolean(initialData?.required));
  const [options, setOptions] = useState<string[]>(
    initialData?.options?.map((option) => option.text) || ['', '']
  );

  const addOption = () => setOptions((previous) => [...previous, '']);

  const removeOption = (index: number) => {
    setOptions((previous) => previous.filter((_, optionIndex) => optionIndex !== index));
  };

  const updateOption = (index: number, value: string) => {
    setOptions((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim()) {
      alert('Spørsmålet må ha en tekst');
      return;
    }

    const validOptions = options.map((option) => option.trim()).filter(Boolean);
    if (questionType === 'single_choice' && validOptions.length < 2) {
      alert('Flervalgsspørsmål må ha minst 2 alternativer');
      return;
    }

    const timestamp = Date.now();

    onSave({
      id: initialData?.id || timestamp,
      prompt: prompt.trim(),
      type: questionType,
      required: isRequired,
      options:
        questionType === 'single_choice'
          ? validOptions.map((text, index) => ({ id: `opt-${index}-${timestamp}`, text }))
          : [],
      createdAt: initialData?.createdAt || new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label>Spørsmål</Label>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Skriv spørsmålet..."
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <select
          value={questionType}
          onChange={(event) => setQuestionType(event.target.value as QuestionType)}
          className="w-full rounded-md border border-input bg-background p-2"
        >
          <option value="open_text">Åpent svar</option>
          {/* <option value="single_choice">Single choice</option> */}
        </select>
      </div>

      {questionType === 'single_choice' && (
        <div className="space-y-2">
          <Label>Alternativer</Label>
          {options.map((option, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={option}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={`Alternativ ${index + 1}`}
              />
              {options.length > 2 && (
                <Button type="button" variant="outline" onClick={() => removeOption(index)}>
                  Fjern
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addOption}>
            Legg til alternativ
          </Button>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(event) => setIsRequired(event.target.checked)}
        />
        Obligatorisk svar
      </label>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
        )}
        <Button type="submit">Lagre spørsmål</Button>
      </div>
    </form>
  );
}