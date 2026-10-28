import { learningErrorResponse, learningJson, readAccountLearning } from '@/lib/learning-api';

export async function GET(request: Request) {
  try { return learningJson(await readAccountLearning(request)); }
  catch (error) { return learningErrorResponse(error); }
}
