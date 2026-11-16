import { CodingQuestionBrowser } from '@/components/coding-question-browser';
import { originalCoding250Candidates } from '@/lib/curriculum/original-coding-250/questions-index';

export default function CodingQuestionBrowserPage() {
  const items = originalCoding250Candidates.map(question => ({
    id: question.id,
    topic: question.topic,
    difficulty: question.difficulty,
    estimatedMinutes: question.estimatedMinutes,
    title: question.title,
    prompt: question.prompt,
    conceptIds: question.conceptIds,
  }));
  return <CodingQuestionBrowser items={items} />;
}
