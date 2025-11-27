import applyCors from '../helpers/cors.js';
import hydrateJob from '../helpers/hydrateJob.js';
import normalize from '../helpers/normalize.js';
import extractStructure from '../helpers/extractStructure.js';
import createStandardPrompt from '../prompts/createStandardPrompt.js';
import createJobPrompt from '../prompts/createJobMatchingPrompt.js';
import openaiClient from '../helpers/openaiClient.js';
import validateAnalysis from '../helpers/validateAnalysis.js';
import computeAtsSignals from '../helpers/computeAtsSignals.js';
import fallbackAnalysis from '../helpers/fallbackAnalysis.js';

export default async function handler(req, res) {
  try { applyCors(req, res); } catch (err) {
    return res.status(500).json({ error: 'CORS configuration error' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { resumeText, jobDescription, hydrateOnly = false } = req.body || {};

    const safeResume = typeof resumeText === 'string' ? resumeText : '';
    const safeJob = typeof jobDescription === 'string' ? jobDescription : '';

    const hydrated = await hydrateJob(safeJob);
    const normalizedResume = normalize(safeResume);
    const normalizedJob = normalize(hydrated.text || '');
    const hasJob = normalizedJob.trim().length > 20;

    if (hydrateOnly) {
      return res.status(200).json({
        success: Boolean(hasJob || !hydrated.error),
        jobMatched: hasJob,
        jobDescriptionResolved: normalizedJob,
        jobDescriptionSource: hydrated.source,
        jobDescriptionUrl: hydrated.fetchedFrom,
        jobDescriptionError: hydrated.error
      });
    }

    if (!safeResume || safeResume.trim().length < 50) {
      return res.status(400).json({ error: 'Resume text is required and must be at least 50 characters' });
    }

    const structure = extractStructure(normalizedResume);
    const prompt = hasJob
      ? createJobPrompt(normalizedResume, normalizedJob)
      : createStandardPrompt(normalizedResume);

    const aiResponse = await openaiClient(prompt);

    let analysis = aiResponse || fallbackAnalysis(normalizedResume, hasJob, normalizedJob);
    analysis = validateAnalysis(analysis, normalizedResume, normalizedJob);

    const atsSignals = computeAtsSignals(normalizedResume, normalizedJob, structure);
    analysis.atsSignals = atsSignals;

    return res.status(200).json({
      success: true,
      analysis,
      structureSignals: structure,
      jobMatched: hasJob,
      jobDescriptionResolved: normalizedJob,
      jobDescriptionSource: hydrated.source,
      jobDescriptionUrl: hydrated.fetchedFrom,
      jobDescriptionError: hydrated.error
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to analyze resume', message: err.message });
  }
}
