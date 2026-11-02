import { readWrittenList, saveWrittenDraft, writtenFailure, writtenJson } from '@/lib/written-assessment-api';
export const runtime = 'nodejs';
export async function GET(request: Request) { try { return writtenJson(await readWrittenList(request)); } catch (error) { return writtenFailure(error); } }
export async function POST(request: Request) { try { return writtenJson(await saveWrittenDraft(request)); } catch (error) { return writtenFailure(error); } }
