import { DEFAULT_TRAVEL_PROMPT, MAX_PROMPT_LENGTH, validateTravelPrompt } from '@/lib/ai-prompt';
import { readConfigFile, writeConfigFile } from './config-file';

export function readTravelPrompt() {
  const saved = readConfigFile<{ prompt: string }>('ai-prompt.json', []);
  return saved ? validateTravelPrompt(saved.prompt) : DEFAULT_TRAVEL_PROMPT;
}
export function promptSettings() {
  return { prompt: readTravelPrompt(), defaultPrompt: DEFAULT_TRAVEL_PROMPT, maxLength: MAX_PROMPT_LENGTH };
}
export function saveTravelPrompt(value: unknown) {
  writeConfigFile('ai-prompt.json', { prompt: validateTravelPrompt(value) }, []);
  return promptSettings();
}
