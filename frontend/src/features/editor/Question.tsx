import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type QuestionType = 'open_text' | 'single_choice';
type OpenTextDisplayMode = 'word_cloud' | 'answer_list';

type QuestionOption = {
  id: string;
  text: string;
};

type QuestionData = {
  id: string | number;
  prompt: string;
  type: QuestionType;
  openTextDisplayMode?: OpenTextDisplayMode;
  options: QuestionOption[];
  required: boolean;
  createdAt: string;
};

type Props = {
  initialData?: Partial<QuestionData> | null;
  onSave: (question: QuestionData) => void;
  onCancel?: () => void;
};

// Komponent for å opprette eller redigere et spørsmål, med støtte for både åpne tekstsvar og flervalgsspørsmål, og validering av input før lagring.
export default function Question({ initialData = null, onSave, onCancel }: Props) {
  const initialOpenTextDisplayMode =
    (initialData as { open_text_display_mode?: OpenTextDisplayMode } | null)?.open_text_display_mode ??
    initialData?.openTextDisplayMode;

  const [prompt, setPrompt] = useState(initialData?.prompt || '');
  const [questionType, setQuestionType] = useState<QuestionType>(initialData?.type ?? 'open_text');
  const [openTextDisplayMode, setOpenTextDisplayMode] = useState<OpenTextDisplayMode>(
    initialOpenTextDisplayMode === 'answer_list' ? 'answer_list' : 'word_cloud'
  );
  const [isRequired, setIsRequired] = useState(Boolean(initialData?.required));
  const [options, setOptions] = useState<string[]>(
    initialData?.options?.map((option) => option.text) || ['', '']
  );

  // Legger til et nytt tomt alternativ i listen over alternativer for flervalgsspørsmål.
  const addOption = () => setOptions((previous) => [...previous, '']);
  
  // Fjerner et alternativ basert på indeksen i listen over alternativer for flervalgsspørsmål.
  const removeOption = (index: number) => {
    setOptions((previous) => previous.filter((_, optionIndex) => optionIndex !== index));
  };

  // Oppdaterer teksten for et spesifikt alternativ basert på indeksen i listen over alternativer for flervalgsspørsmål.
  const updateOption = (index: number, value: string) => {
    setOptions((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  };

  // Håndterer lagring av spørsmålet ved å validere input, generere nødvendige data og kalle onSave callbacken med det nye eller oppdaterte spørsmålet.
  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!prompt.trim()) {
      alert('Spørsmålet må ha en tekst');
      return;
    }

    // For flervalgsspørsmål, validerer at det er minst 2 gyldige alternativer (ikke tomme eller bare whitespace) før lagring.
    const validOptions = options.map((option) => option.trim()).filter(Boolean);
    if (questionType === 'single_choice' && validOptions.length < 2) {
      alert('Flervalgsspørsmål må ha minst 2 alternativer');
      return;
    }

    // Lager en unik ID for spørsmålet basert på eksisterende ID eller nåværende timestamp, og forbereder dataene for lagring.
    const timestamp = Date.now();

    onSave({
      id: initialData?.id || timestamp,
      prompt: prompt.trim(),
      type: questionType,
      openTextDisplayMode: questionType === 'open_text' ? openTextDisplayMode : undefined,
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
          <option value="single_choice">Flervalgsspørsmål</option> 
        </select>
      </div>

      {questionType === 'open_text' && (
        <div className="space-y-2">
          <Label>Vis svar som</Label>
          <select
            value={openTextDisplayMode}
            onChange={(event) => setOpenTextDisplayMode(event.target.value as OpenTextDisplayMode)}
            className="w-full rounded-md border border-input bg-background p-2"
          >
            <option value="word_cloud">Word cloud</option>
            <option value="answer_list">Vanlig svarliste</option>
          </select>
        </div>
      )}

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