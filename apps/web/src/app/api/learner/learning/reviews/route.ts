import { learningErrorResponse, learningJson, snoozeAccountLearning } from '@/lib/learning-api';

export async function POST(request: Request) {
  try { return learningJson(await snoozeAccountLearning(request)); }
  catch (error) { return learningErrorResponse(error); }
}
