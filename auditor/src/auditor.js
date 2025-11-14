/**
 * PatternFly MCP Auditor - Core Audit Logic
 * 
 * Handles question shuffling, MCP client communication, model interaction,
 * and consistency analysis.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

/**
 * Load questions from YAML file or use defaults
 */
function loadQuestions(config) {
  const baseline = config.questions?.baseline || getDefaultBaselineQuestions();
  const pfMcp = config.questions?.['pf-mcp'] || getDefaultPfMcpQuestions();

  return { baseline, pfMcp };
}

/**
 * Get default baseline questions (embedded fallback)
 */
function getDefaultBaselineQuestions() {
  return [
    { id: 'baseline-1', prompt: 'What is the capital of France?', category: 'general' },
    { id: 'baseline-2', prompt: 'Explain the concept of recursion in programming.', category: 'programming' },
    { id: 'baseline-3', prompt: 'What are the three laws of thermodynamics?', category: 'science' },
    { id: 'baseline-4', prompt: 'Describe the difference between HTTP and HTTPS.', category: 'technology' },
    { id: 'baseline-5', prompt: 'What is the purpose of version control systems?', category: 'technology' }
  ];
}

/**
 * Get default PF-MCP questions (embedded fallback)
 */
function getDefaultPfMcpQuestions() {
  return [
    {
      id: 'pf-mcp-1',
      prompt: 'What tools are available in the PatternFly MCP server? List all available tools.',
      category: 'tooling',
      expectedTool: 'usePatternFlyDocs'
    },
    {
      id: 'pf-mcp-2',
      prompt: 'How do I use the usePatternFlyDocs tool to fetch PatternFly documentation?',
      category: 'tooling',
      expectedTool: 'usePatternFlyDocs'
    },
    {
      id: 'pf-mcp-3',
      prompt: 'What is the componentSchemas tool and how do I use it to get component prop definitions?',
      category: 'tooling',
      expectedTool: 'componentSchemas'
    }
  ];
}

/**
 * Shuffle questions with random PF-MCP interjection
 */
function shuffleQuestions(baseline, pfMcp, strategy = 'random') {
  const questions = [...baseline];
  const pfMcpCopy = [...pfMcp];

  if (strategy === 'random') {
    // Randomly interject PF-MCP questions
    for (const pfQuestion of pfMcpCopy) {
      const randomIndex = Math.floor(Math.random() * (questions.length + 1));
      questions.splice(randomIndex, 0, pfQuestion);
    }
  } else if (strategy === 'even') {
    // Evenly distribute PF-MCP questions
    const interval = Math.floor(baseline.length / (pfMcpCopy.length + 1));
    pfMcpCopy.forEach((pfQuestion, index) => {
      questions.splice((index + 1) * interval, 0, pfQuestion);
    });
  } else if (strategy === 'weighted') {
    // Weighted distribution based on ratio
    const ratio = 0.3; // Default ratio
    const totalPfMcp = Math.floor(baseline.length * ratio);
    for (let i = 0; i < totalPfMcp && i < pfMcpCopy.length; i++) {
      const randomIndex = Math.floor(Math.random() * (questions.length + 1));
      questions.splice(randomIndex, 0, pfMcpCopy[i]);
    }
  }

  return questions;
}

/**
 * Run health checks
 */
async function runHealthChecks(config) {
  const results = [];
  const checks = config.healthChecks || [];

  for (const check of checks) {
    try {
      if (check.type === 'http') {
        const url = `${config.mcp.url}${check.endpoint || ''}`;
        const response = await fetch(url, {
          method: 'GET',
          timeout: config.mcp.timeout || 10000
        });
        results.push({
          name: check.name,
          status: response.ok ? 'pass' : 'fail',
          message: response.ok ? 'Server accessible' : `HTTP ${response.status}`
        });
      } else if (check.type === 'mcp') {
        // Check if MCP server responds to list_tools
        const mcpResponse = await callMcpMethod('tools/list', {}, config);
        const tools = mcpResponse?.tools || [];
        const hasTool = tools.some(t => t.name === check.tool);
        results.push({
          name: check.name,
          status: hasTool ? 'pass' : 'fail',
          message: hasTool ? `Tool ${check.tool} registered` : `Tool ${check.tool} not found`
        });
      }
    } catch (error) {
      results.push({
        name: check.name,
        status: 'fail',
        message: error.message
      });
    }
  }

  return results;
}

/**
 * Call MCP server method via HTTP
 */
async function callMcpMethod(method, params, config) {
  const url = config.mcp.url;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    }),
    timeout: config.mcp.timeout || 10000
  });

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  return data.result;
}

/**
 * Initialize model (node-llama-cpp)
 */
async function initializeModel(config) {
  // Lazy import to avoid loading if not needed
  const { getLlama } = await import('node-llama-cpp');
  
  const modelPath = config.model?.path;
  const Llama = await getLlama();

  // For now, we'll use a default small model
  // In production, this would download or use a volume-mounted model
  let model;
  
  if (modelPath) {
    // Future: Load custom model from volume
    console.log(`   Loading custom model from: ${modelPath}`);
    // model = await Llama.loadModel({ modelPath });
    throw new Error('Custom model loading not yet implemented');
  } else {
    // Use embedded model (to be implemented)
    console.log(`   Using embedded model (placeholder)`);
    // For now, return a mock model interface
    return createMockModel();
  }
}

/**
 * Create mock model for development/testing
 * TODO: Replace with actual node-llama-cpp model
 */
function createMockModel() {
  return {
    async complete(prompt, options = {}) {
      // Mock response - in real implementation, this would call the model
      return {
        text: `[Mock response to: ${prompt}] This is a placeholder response.`,
        tokens: 10
      };
    },
    async close() {
      // Cleanup
    }
  };
}

/**
 * Run a single audit run
 */
async function runAuditRun(runNumber, questions, model, config) {
  console.log(`\n🔄 Run ${runNumber}/${config.audit.runs}`);
  
  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const startTime = Date.now();

    try {
      console.log(`   [${i + 1}/${questions.length}] ${question.id}: ${question.prompt.substring(0, 50)}...`);

      // Send question to model
      const modelResponse = await Promise.race([
        model.complete(question.prompt, {
          temperature: config.model?.temperature || 0.7,
          maxTokens: config.model?.maxTokens || 512
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model timeout')), config.audit.timeout || 30000)
        )
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract tool calls from response (simplified - real implementation would parse model output)
      const toolCalls = extractToolCalls(modelResponse.text, config);

      results.push({
        runNumber,
        questionId: question.id,
        prompt: question.prompt,
        category: question.category,
        answer: modelResponse.text,
        toolCalls,
        duration,
        timestamp: new Date().toISOString(),
        success: true
      });
    } catch (error) {
      const endTime = Date.now();
      results.push({
        runNumber,
        questionId: question.id,
        prompt: question.prompt,
        category: question.category,
        answer: null,
        toolCalls: [],
        duration: endTime - startTime,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Extract tool calls from model response
 * This is a simplified parser - real implementation would need more sophisticated parsing
 */
function extractToolCalls(text, config) {
  const toolCalls = [];
  
  // Simple pattern matching for tool calls
  // In real implementation, this would parse structured model output
  const toolPatterns = [
    /usePatternFlyDocs/i,
    /fetchDocs/i,
    /componentSchemas/i
  ];

  for (const pattern of toolPatterns) {
    if (pattern.test(text)) {
      const toolName = pattern.source.replace(/[\/i]/g, '').toLowerCase();
      toolCalls.push({
        tool: toolName,
        args: {},
        timestamp: Date.now()
      });
    }
  }

  return toolCalls;
}

/**
 * Analyze consistency across runs
 */
function analyzeConsistency(allResults) {
  // Group results by question ID
  const byQuestion = {};
  for (const result of allResults) {
    if (!byQuestion[result.questionId]) {
      byQuestion[result.questionId] = [];
    }
    byQuestion[result.questionId].push(result);
  }

  const analysis = {
    overall: {
      consistencyScore: 0,
      consistentRuns: 0,
      inconsistentRuns: 0,
      totalQuestions: Object.keys(byQuestion).length
    },
    questions: {}
  };

  // Analyze each question
  for (const [questionId, runs] of Object.entries(byQuestion)) {
    const questionAnalysis = {
      toolConsistency: analyzeToolCalls(runs),
      answerConsistency: analyzeAnswers(runs),
      timingConsistency: analyzeTiming(runs),
      overallConsistency: 0
    };

    // Weighted average
    questionAnalysis.overallConsistency =
      (questionAnalysis.toolConsistency.consistency * 0.4) +
      (questionAnalysis.answerConsistency.consistency * 0.4) +
      (questionAnalysis.timingConsistency.consistency * 0.2);

    analysis.questions[questionId] = questionAnalysis;

    // Count consistent vs inconsistent
    if (questionAnalysis.overallConsistency >= 0.8) {
      analysis.overall.consistentRuns++;
    } else {
      analysis.overall.inconsistentRuns++;
    }
  }

  // Calculate overall score
  if (analysis.overall.totalQuestions > 0) {
    analysis.overall.consistencyScore =
      Object.values(analysis.questions)
        .reduce((sum, q) => sum + q.overallConsistency, 0) /
      analysis.overall.totalQuestions;
  }

  return analysis;
}

/**
 * Analyze tool call consistency
 */
function analyzeToolCalls(runs) {
  if (runs.length === 0) {
    return { consistency: 1.0, isConsistent: true, toolCalls: [] };
  }

  const toolCallSets = runs.map(r => 
    (r.toolCalls || []).map(tc => tc.tool).sort().join(',')
  );

  const first = toolCallSets[0];
  const allSame = toolCallSets.every(tc => tc === first);
  const consistency = allSame ? 1.0 :
    toolCallSets.filter(tc => tc === first).length / toolCallSets.length;

  return {
    consistency,
    isConsistent: consistency >= 0.8,
    toolCalls: toolCallSets,
    variance: allSame ? 0 : calculateVariance(toolCallSets.map(tc => tc.length))
  };
}

/**
 * Analyze answer consistency
 */
function analyzeAnswers(runs) {
  if (runs.length === 0) {
    return { consistency: 1.0, isConsistent: true };
  }

  const answers = runs.map(r => r.answer || '').filter(a => a.length > 0);
  if (answers.length === 0) {
    return { consistency: 0, isConsistent: false };
  }

  // Simple consistency check based on answer length
  // Real implementation would use semantic similarity
  const lengths = answers.map(a => a.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = calculateVariance(lengths);
  const consistency = variance < avgLength * 0.3 ? 1.0 : Math.max(0, 1 - (variance / avgLength));

  return {
    consistency,
    isConsistent: consistency >= 0.7,
    answerLengths: lengths,
    variance
  };
}

/**
 * Analyze timing consistency
 */
function analyzeTiming(runs) {
  if (runs.length === 0) {
    return { consistency: 1.0, isConsistent: true };
  }

  const durations = runs.map(r => r.duration || 0);
  const variance = calculateVariance(durations);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const consistency = variance < avgDuration * 0.2 ? 1.0 : Math.max(0, 1 - (variance / avgDuration));

  return {
    consistency,
    isConsistent: consistency >= 0.8,
    durations,
    variance,
    avgDuration
  };
}

/**
 * Calculate standard deviation (variance)
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Main audit function
 */
export async function runAudit(config) {
  // Load questions
  const { baseline, pfMcp } = loadQuestions(config);
  const strategy = config.interjection?.strategy || 'random';
  const questions = shuffleQuestions(baseline, pfMcp, strategy);

  console.log(`   Loaded ${baseline.length} baseline questions`);
  console.log(`   Loaded ${pfMcp.length} PF-MCP questions`);
  console.log(`   Total questions per run: ${questions.length}`);
  console.log(`   Interjection strategy: ${strategy}`);

  // Run health checks
  console.log('\n🏥 Running health checks...');
  const healthChecks = await runHealthChecks(config);
  healthChecks.forEach(check => {
    const icon = check.status === 'pass' ? '✅' : '❌';
    console.log(`   ${icon} ${check.name}: ${check.message}`);
  });

  // Initialize model
  console.log('\n🤖 Initializing model...');
  const model = await initializeModel(config);

  // Run audit runs
  const allResults = [];
  for (let run = 1; run <= config.audit.runs; run++) {
    const results = await runAuditRun(run, questions, model, config);
    allResults.push(...results);

    // Small delay between runs
    if (run < config.audit.runs) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Cleanup model
  if (model.close) {
    await model.close();
  }

  // Analyze consistency
  console.log('\n📊 Analyzing consistency...');
  const analysis = analyzeConsistency(allResults);

  return {
    config,
    healthChecks,
    questions,
    results: allResults,
    analysis,
    timestamp: new Date().toISOString()
  };
}

