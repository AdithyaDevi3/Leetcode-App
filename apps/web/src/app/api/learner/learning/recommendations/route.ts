import { learningErrorResponse, learningJson, selectAccountRecommendation } from '@/lib/learning-api';

export async function POST(request: Request) {
  try { return learningJson(await selectAccountRecommendation(request)); }
  catch (error) { return learningErrorResponse(error); }
}
