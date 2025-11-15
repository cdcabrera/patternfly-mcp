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
      prompt: 'What is the PatternFly componentSchemas tool and how do I use it to get PatternFly component prop definitions?',
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
          message: response.ok ? 'Server accessible' : `HTTP ${response.status}`,
          critical: check.critical || false
        });
      } else if (check.type === 'mcp') {
        // Check if MCP server responds to tools/list
        // First ensure we're initialized (only once, reuse session)
        if (!mcpSessionId) {
          try {
            const initResult = await callMcpMethod('initialize', {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: {
                name: 'patternfly-mcp-auditor',
                version: '1.0.0'
              }
            }, config);
            // Store session ID if returned
            if (initResult?.sessionId) {
              mcpSessionId = initResult.sessionId;
            }
          } catch (initError) {
            // If initialization fails, the tools/list will also fail, so throw
            throw new Error(`MCP initialization failed: ${initError.message}`);
          }
        }
        
        const mcpResponse = await callMcpMethod('tools/list', {}, config);
        const tools = mcpResponse?.tools || [];
        
        // Debug: Log tools received during health check
        if (tools.length > 0) {
          console.log(`   🔧 Health check: Received ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
        } else {
          console.warn(`   ⚠️  Health check: No tools returned! Response: ${JSON.stringify(mcpResponse)}`);
        }
        
        const hasTool = tools.some(t => t.name === check.tool);
        results.push({
          name: check.name,
          status: hasTool ? 'pass' : 'fail',
          message: hasTool ? `Tool ${check.tool} registered` : `Tool ${check.tool} not found (received ${tools.length} tools: ${tools.map(t => t.name).join(', ') || 'none'})`,
          critical: check.critical || false
        });
      }
    } catch (error) {
      results.push({
        name: check.name,
        status: 'fail',
        message: error.message || String(error),
        critical: check.critical || false
      });
    }
  }

  // Check for critical failures
  const criticalFailures = results.filter(r => r.critical && r.status === 'fail');
  if (criticalFailures.length > 0) {
    const failureMessages = criticalFailures.map(f => `  - ${f.name}: ${f.message}`).join('\n');
    const mcpUrl = config.mcp?.url || 'not configured';
    
    throw new Error(
      `❌ Critical health check(s) failed:\n${failureMessages}\n\n` +
      `MCP server is not available at ${mcpUrl}\n\n` +
      `Troubleshooting:\n` +
      `  1. Ensure MCP server is running: npm run auditor:mcp:start\n` +
      `  2. Check the URL is correct: ${mcpUrl}\n` +
      `  3. For containerized execution, use: http://host.containers.internal:3000\n` +
      `  4. Verify MCP server is in HTTP mode: npx @patternfly/patternfly-mcp --http --port 3000\n\n` +
      `Exiting audit.`
    );
  }

  return results;
}

/**
 * Call MCP server method via HTTP
 */
// Store session ID for MCP HTTP transport
let mcpSessionId = null;

async function callMcpMethod(method, params, config) {
  const url = config.mcp.url;
  
  // Prepare headers with required Accept header for MCP HTTP transport
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  
  // Add session ID if we have one
  if (mcpSessionId) {
    headers['mcp-session-id'] = mcpSessionId;
  }
  
  let response;
  const timeout = config.mcp?.timeout || 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now()
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeout}ms`);
    }
    // node-fetch v3 error format: "request to <url> failed, reason: <reason>"
    const errorMsg = fetchError.message || String(fetchError);
    const reasonMatch = errorMsg.match(/reason: (.+)$/);
    const reason = reasonMatch ? reasonMatch[1] : (fetchError.cause?.message || errorMsg);
    throw new Error(`Failed to connect to MCP server at ${url}: ${reason}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
  }

  // Extract session ID from response headers if present
  const sessionIdHeader = response.headers.get('mcp-session-id');
  if (sessionIdHeader && !mcpSessionId) {
    mcpSessionId = sessionIdHeader;
  }

  // Handle SSE response (text/event-stream)
  const contentType = response.headers.get('content-type') || '';
  let data;
  
  if (contentType.includes('text/event-stream')) {
    // Parse SSE format
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonData = line.substring(6).trim();
        if (jsonData) {
          data = JSON.parse(jsonData);
          break;
        }
      }
    }
    if (!data) {
      throw new Error('Failed to parse SSE response');
    }
  } else {
    // Regular JSON response
    data = await response.json();
  }

  if (data.error) {
    // If it's a "not initialized" error, try to initialize first
    if (data.error.message && data.error.message.includes('not initialized') && method !== 'initialize') {
      // Initialize the session first
      await callMcpMethod('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'patternfly-mcp-auditor',
          version: '1.0.0'
        }
      }, config);
      // Retry the original call
      return await callMcpMethod(method, params, config);
    }
    throw new Error(`MCP error: ${data.error.message}`);
  }

  // Debug: Log response for tools/list to verify structure (only if verbose or no tools found)
  if (method === 'tools/list' && (!data.result?.tools || data.result.tools.length === 0)) {
    console.warn(`   ⚠️  tools/list returned no tools. Full response:`, JSON.stringify(data, null, 2));
  }

  return data.result;
}

/**
 * Initialize model (node-llama-cpp)
 */
async function initializeModel(config) {
  // Lazy import to avoid loading if not needed
  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
  
  const modelPath = config.model?.path;
  const Llama = await getLlama();

  let model;
  let context;
  let session;
  
  if (modelPath) {
    // Load custom model from volume
    console.log(`   Loading custom model from: ${modelPath}`);
    try {
      model = await validateAndLoadModel(Llama, modelPath);
    } catch (error) {
      throw new Error(`Failed to load custom model: ${error.message}`);
    }
  } else {
    // Use default small model (download if needed)
    console.log(`   Using default model (Qwen2.5-0.5B)`);
    const defaultModelPath = await getDefaultModel(Llama);
    
    if (!defaultModelPath) {
      // No model found, will fall back to mock
      throw new Error('Default model not found. Place model in ./models/ or /workspace/model/');
    }
    
    model = await Llama.loadModel({
      modelPath: defaultModelPath
    });
  }

  // Create context and session
  context = await model.createContext({
    contextSize: 2048, // Small context for efficiency
    batchSize: 512
  });
  
  session = new LlamaChatSession({
    contextSequence: context.getSequence()
  });

  return {
    model,
    context,
    session,
    async complete(prompt, options = {}) {
      const temperature = options.temperature ?? config.model?.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? config.model?.maxTokens ?? 512;

      // Use the chat session to get completion
      const response = await session.prompt(prompt, {
        temperature,
        maxTokens
      });

      return {
        text: response,
        tokens: response.split(/\s+/).length // Approximate token count
      };
    },
    async close() {
      if (session) {
        // Session cleanup handled by context
      }
      if (context) {
        context.dispose();
      }
      if (model) {
        model.dispose();
      }
    }
  };
}

/**
 * Validate and load custom model
 */
async function validateAndLoadModel(Llama, modelPath) {
  // Check if model file exists
  const { existsSync } = await import('fs');
  if (!existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  // Try to load the model
  try {
    const model = await Llama.loadModel({ modelPath });
    return model;
  } catch (error) {
    throw new Error(`Model loading failed: ${error.message}. Ensure model is in GGUF format and compatible with node-llama-cpp.`);
  }
}

/**
 * Get default model (download if needed)
 * Checks multiple locations for model files
 */
async function getDefaultModel(Llama) {
  const { existsSync, readdirSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  
  // Get the auditor directory (where this file is located)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const auditorDir = dirname(__dirname); // Go up from src/ to auditor/
  const rootDir = dirname(auditorDir); // Go up from auditor/ to root/
  
  // List of locations to check (in priority order)
  const searchPaths = [
    // 1. Container volume mount - dedicated model directory
    '/workspace/model',
    // 2. Container volume mount - auditor models (when running in container)
    '/workspace/auditor/models',
    // 3. Auditor models directory (auditor/models/) - when running locally
    join(auditorDir, 'models'),
    // 4. Root models directory (./models/ from root)
    join(rootDir, 'models'),
    // 5. Current working directory models (./models/ from cwd)
    join(process.cwd(), 'models'),
    // 6. Auditor directory when running from root
    join(process.cwd(), 'auditor', 'models')
  ];

  // Preferred model names (in order of preference)
  const preferredModels = [
    'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    'qwen2.5-0.5b-instruct.gguf',
    'qwen2.5-0.5b.gguf'
  ];

  // First, try to find preferred model names
  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      for (const modelName of preferredModels) {
        const modelPath = join(searchPath, modelName);
        if (existsSync(modelPath)) {
          console.log(`   ✅ Found model: ${modelPath}`);
          return modelPath;
        }
      }
    }
  }

  // If preferred models not found, look for any .gguf file
  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      try {
        const files = readdirSync(searchPath);
        const ggufFiles = files.filter(f => f.endsWith('.gguf'));
        if (ggufFiles.length > 0) {
          const modelPath = join(searchPath, ggufFiles[0]);
          console.log(`   ✅ Found model: ${modelPath} (${ggufFiles[0]})`);
          if (ggufFiles.length > 1) {
            console.log(`   ℹ️  Multiple models found, using: ${ggufFiles[0]}`);
            console.log(`   ℹ️  Other models: ${ggufFiles.slice(1).join(', ')}`);
          }
          return modelPath;
        }
      } catch (error) {
        // Skip if directory can't be read
        continue;
      }
    }
  }

  // No model found
  console.warn('   ⚠️  No model found in any of these locations:');
  searchPaths.forEach(path => console.warn(`      - ${path}`));
  console.warn('   📥 To use a real model, download a GGUF model and place it in:');
  console.warn('      - auditor/models/ (recommended)');
  console.warn('      - ./models/ (root directory)');
  console.warn('      - /workspace/model/ (container volume)');
  return null; // Will trigger mock model fallback
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

      // For PF-MCP questions, call MCP tools first to get actual data
      let toolCalls = [];
      let toolResults = '';
      
      if (question.category === 'tooling') {
        try {
          // Get available tools first
          const toolsList = await callMcpMethod('tools/list', {}, config);
          const tools = toolsList?.tools || [];
          
          // Debug: Log tools received
          console.log(`   🔧 Tools received from MCP: ${tools.length} tools`);
          if (tools.length > 0) {
            console.log(`   🔧 Tool names: ${tools.map(t => t.name).join(', ')}`);
          } else {
            console.warn(`   ⚠️  No tools returned from tools/list! Response: ${JSON.stringify(toolsList)}`);
          }
          
          // Call appropriate tool based on question
          if (question.id === 'pf-mcp-1' || question.prompt.includes('tools are available')) {
            // List tools question - use tools/list result
            if (tools.length > 0) {
              toolResults = `Available PatternFly MCP tools:\n${tools.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n')}`;
            } else {
              toolResults = `No tools were returned from the PatternFly MCP server. This may indicate a connection issue.`;
            }
            toolCalls.push({
              tool: 'tools/list',
              args: {},
              timestamp: Date.now()
            });
          } else if (question.id === 'pf-mcp-2' || question.prompt.includes('usePatternFlyDocs')) {
            // Example: call usePatternFlyDocs with a sample URL
            const toolResult = await callMcpMethod('tools/call', {
              name: 'usePatternFlyDocs',
              arguments: {
                urlList: ['https://www.patternfly.org/v4/components/about-modal']
              }
            }, config);
            // Extract content from tool result
            const content = toolResult?.content?.[0]?.text || JSON.stringify(toolResult, null, 2);
            toolResults = `Tool result from usePatternFlyDocs:\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
            toolCalls.push({
              tool: 'usePatternFlyDocs',
              args: { urlList: ['https://www.patternfly.org/v4/components/about-modal'] },
              timestamp: Date.now()
            });
          } else if (question.id === 'pf-mcp-3' || question.prompt.includes('componentSchemas')) {
            // Example: call componentSchemas
            const toolResult = await callMcpMethod('tools/call', {
              name: 'componentSchemas',
              arguments: {
                componentName: 'Button'
              }
            }, config);
            // Extract content from tool result
            const content = toolResult?.content?.[0]?.text || JSON.stringify(toolResult, null, 2);
            toolResults = `Tool result from componentSchemas:\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
            toolCalls.push({
              tool: 'componentSchemas',
              args: { componentName: 'Button' },
              timestamp: Date.now()
            });
          }
        } catch (toolError) {
          console.warn(`   ⚠️  Tool call failed for ${question.id}: ${toolError.message}`);
          // Continue without tool results - model will answer from its knowledge
        }
      }

      // Build prompt with tool results and conciseness constraint
      const conciseEnabled = config.model?.concise !== false; // Default to true
      let prompt = question.prompt;
      
      if (toolResults) {
        prompt = `${prompt}\n\nHere is the actual data from the PatternFly MCP server:\n${toolResults}\n\nPlease use this information to answer the question.`;
      }
      
      if (conciseEnabled) {
        prompt = `Please be concise in your response. ${prompt}`;
      }

      // Send question to model
      const modelResponse = await Promise.race([
        model.complete(prompt, {
          temperature: config.model?.temperature || 0.7,
          maxTokens: config.model?.maxTokens || 512
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model timeout')), config.audit.timeout || 30000)
        )
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      results.push({
        runNumber,
        questionId: question.id,
        prompt: question.prompt,
        category: question.category,
        answer: modelResponse.text,
        toolCalls,
        toolResults: toolResults || null, // Store tool results for consistency analysis
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
    /searchPatternFlyDocs/i,
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
function analyzeConsistency(allResults, questions) {
  // Group results by question ID
  const byQuestion = {};
  for (const result of allResults) {
    if (!byQuestion[result.questionId]) {
      byQuestion[result.questionId] = [];
    }
    byQuestion[result.questionId].push(result);
  }

  // Separate PF-MCP and baseline questions
  const pfMcpQuestionIds = questions.filter(q => q.category === 'tooling').map(q => q.id);
  const baselineQuestionIds = questions.filter(q => q.category !== 'tooling').map(q => q.id);

  const analysis = {
    overall: {
      consistencyScore: 0,
      consistentRuns: 0,
      inconsistentRuns: 0,
      totalQuestions: Object.keys(byQuestion).length
    },
    pfMcp: {
      consistencyScore: 0,
      consistentRuns: 0,
      inconsistentRuns: 0,
      totalQuestions: pfMcpQuestionIds.length
    },
    baseline: {
      consistencyScore: 0,
      consistentRuns: 0,
      inconsistentRuns: 0,
      totalQuestions: baselineQuestionIds.length
    },
    questions: {}
  };

  // Analyze each question
  for (const [questionId, runs] of Object.entries(byQuestion)) {
    const question = questions.find(q => q.id === questionId);
    const isPfMcp = question && question.category === 'tooling';
    
    const questionAnalysis = {
      toolConsistency: analyzeToolCalls(runs),
      answerConsistency: analyzeAnswers(runs, question),
      timingConsistency: analyzeTiming(runs),
      overallConsistency: 0
    };

    // Weighted average - different weights for PF-MCP vs baseline
    // PF-MCP: Tool (50%) + Answer (30%) + Timing (20%) - tool usage is most important
    // Baseline: Tool (40%) + Answer (40%) + Timing (20%) - balanced approach
    if (isPfMcp) {
      questionAnalysis.overallConsistency =
        (questionAnalysis.toolConsistency.consistency * 0.5) +
        (questionAnalysis.answerConsistency.consistency * 0.3) +
        (questionAnalysis.timingConsistency.consistency * 0.2);
    } else {
      questionAnalysis.overallConsistency =
        (questionAnalysis.toolConsistency.consistency * 0.4) +
        (questionAnalysis.answerConsistency.consistency * 0.4) +
        (questionAnalysis.timingConsistency.consistency * 0.2);
    }

    analysis.questions[questionId] = questionAnalysis;

    // Count consistent vs inconsistent
    if (questionAnalysis.overallConsistency >= 0.8) {
      analysis.overall.consistentRuns++;
      if (pfMcpQuestionIds.includes(questionId)) {
        analysis.pfMcp.consistentRuns++;
      } else if (baselineQuestionIds.includes(questionId)) {
        analysis.baseline.consistentRuns++;
      }
    } else {
      analysis.overall.inconsistentRuns++;
      if (pfMcpQuestionIds.includes(questionId)) {
        analysis.pfMcp.inconsistentRuns++;
      } else if (baselineQuestionIds.includes(questionId)) {
        analysis.baseline.inconsistentRuns++;
      }
    }
  }

  // Calculate overall score (all questions)
  if (analysis.overall.totalQuestions > 0) {
    analysis.overall.consistencyScore =
      Object.values(analysis.questions)
        .reduce((sum, q) => sum + q.overallConsistency, 0) /
      analysis.overall.totalQuestions;
  }

  // Calculate PF-MCP score (primary focus)
  if (analysis.pfMcp.totalQuestions > 0) {
    const pfMcpScores = pfMcpQuestionIds
      .filter(id => analysis.questions[id])
      .map(id => analysis.questions[id].overallConsistency);
    if (pfMcpScores.length > 0) {
      analysis.pfMcp.consistencyScore =
        pfMcpScores.reduce((sum, score) => sum + score, 0) / pfMcpScores.length;
    }
  }

  // Calculate baseline score
  if (analysis.baseline.totalQuestions > 0) {
    const baselineScores = baselineQuestionIds
      .filter(id => analysis.questions[id])
      .map(id => analysis.questions[id].overallConsistency);
    if (baselineScores.length > 0) {
      analysis.baseline.consistencyScore =
        baselineScores.reduce((sum, score) => sum + score, 0) / baselineScores.length;
    }
  }

  return analysis;
}

/**
 * Create mock model for development/testing
 * Used when real model is not available
 */
function createMockModel() {
  return {
    async complete(prompt, options = {}) {
      // Mock response - simulates model behavior
      const responses = [
        `Based on the question "${prompt}", I would need to use MCP tools to provide accurate information.`,
        `To answer "${prompt}", I should check the available tools and documentation.`,
        `This question about "${prompt}" requires accessing PatternFly MCP server tools.`
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      return {
        text: randomResponse,
        tokens: randomResponse.split(/\s+/).length
      };
    },
    async close() {
      // Cleanup (no-op for mock)
    }
  };
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
 * Detect confusion/misinformation in PF-MCP tooling answers
 */
function detectConfusion(answers, question) {
  if (!question || question.category !== 'tooling') {
    return {
      confusionScore: 0,
      incorrectPatterns: [],
      descriptionMisalignment: 0,
      parameterConfusion: 0,
      workflowConfusion: 0
    };
  }

  const lowerAnswers = answers.map(a => a.toLowerCase());
  const confusion = {
    incorrectPatterns: [],
    descriptionMisalignment: 0,
    parameterConfusion: 0,
    workflowConfusion: 0
  };

  // Detect confusion patterns based on expected tool
  const expectedTool = question.expectedTool || '';
  
  if (expectedTool === 'usePatternFlyDocs') {
    // ❌ Wrong: suggesting component names instead of URLs
    const componentNamePatterns = [
      /pass.*component.*name/i,
      /component.*name/i,
      /pass.*"button"/i,
      /pass.*button/i,
      /call.*with.*component/i
    ];
    
    // ❌ Wrong: suggesting command-line usage
    const cliPatterns = [
      /command.*line/i,
      /terminal.*command/i,
      /cli/i,
      /usePatternFlyDocs\s*$/i, // Just the tool name without parameters
      /navigate.*directory/i,
      /open.*terminal/i
    ];
    
    // ✅ Correct: mentioning URLs
    const correctPatterns = [
      /url/i,
      /urlList/i,
      /array.*url/i,
      /documentation.*url/i
    ];
    
    let incorrectCount = 0;
    let correctCount = 0;
    
    for (const answer of lowerAnswers) {
      const hasIncorrect = componentNamePatterns.some(p => p.test(answer)) || 
                          cliPatterns.some(p => p.test(answer));
      const hasCorrect = correctPatterns.some(p => p.test(answer));
      
      if (hasIncorrect && !hasCorrect) {
        incorrectCount++;
        if (componentNamePatterns.some(p => p.test(answer))) {
          confusion.incorrectPatterns.push('suggests component names instead of URLs');
        }
        if (cliPatterns.some(p => p.test(answer))) {
          confusion.incorrectPatterns.push('suggests command-line usage');
        }
      }
      if (hasCorrect) {
        correctCount++;
      }
    }
    
    confusion.parameterConfusion = incorrectCount / answers.length;
    confusion.workflowConfusion = incorrectCount / answers.length;
    
  } else if (expectedTool === 'componentSchemas') {
    // ❌ Wrong: suggesting URLs or search functionality
    const wrongPatterns = [
      /url/i,
      /search.*for/i,
      /lookup/i,
      /fetch.*url/i
    ];
    
    // ✅ Correct: mentioning component name parameter
    const correctPatterns = [
      /componentName/i,
      /component.*name/i,
      /fuzzy.*match/i,
      /pass.*component/i
    ];
    
    let incorrectCount = 0;
    let correctCount = 0;
    
    for (const answer of lowerAnswers) {
      const hasIncorrect = wrongPatterns.some(p => p.test(answer));
      const hasCorrect = correctPatterns.some(p => p.test(answer));
      
      if (hasIncorrect && !hasCorrect) {
        incorrectCount++;
        confusion.incorrectPatterns.push('suggests URLs or search instead of component name');
      }
      if (hasCorrect) {
        correctCount++;
      }
    }
    
    confusion.parameterConfusion = incorrectCount / answers.length;
    
  } else if (expectedTool === 'searchPatternFlyDocs' || question.id === 'pf-mcp-1') {
    // For tools/list or searchPatternFlyDocs - check if answers confuse it with content fetching
    const wrongPatterns = [
      /fetch.*content/i,
      /get.*documentation.*content/i,
      /returns.*content/i
    ];
    
    // ✅ Correct: mentioning URLs only
    const correctPatterns = [
      /returns.*url/i,
      /url.*only/i,
      /does.*not.*fetch/i,
      /search.*url/i
    ];
    
    let incorrectCount = 0;
    
    for (const answer of lowerAnswers) {
      const hasIncorrect = wrongPatterns.some(p => p.test(answer));
      const hasCorrect = correctPatterns.some(p => p.test(answer));
      
      if (hasIncorrect && !hasCorrect) {
        incorrectCount++;
        confusion.incorrectPatterns.push('confuses URL search with content fetching');
      }
    }
    
    confusion.workflowConfusion = incorrectCount / answers.length;
  }

  // Calculate overall confusion score
  const confusionScores = [
    confusion.parameterConfusion,
    confusion.workflowConfusion,
    confusion.descriptionMisalignment
  ].filter(s => s > 0);
  
  confusion.confusionScore = confusionScores.length > 0
    ? confusionScores.reduce((a, b) => a + b, 0) / confusionScores.length
    : 0;

  // Deduplicate incorrect patterns
  confusion.incorrectPatterns = [...new Set(confusion.incorrectPatterns)];

  return confusion;
}

/**
 * Calculate majority-rule consistency (resistant to outliers)
 * Returns consistency based on how many runs match the majority pattern
 */
function calculateMajorityConsistency(answers, similarityThreshold = 0.7) {
  if (answers.length <= 1) {
    return { consistency: 1.0, majoritySize: answers.length };
  }

  // Simple similarity: compare answer lengths and key content
  // Group answers by similarity
  const groups = [];
  
  for (const answer of answers) {
    let matched = false;
    for (const group of groups) {
      // Check if answer is similar to group representative
      const rep = group[0];
      const lengthDiff = Math.abs(answer.length - rep.length) / Math.max(answer.length, rep.length, 1);
      const hasCommonWords = answer.split(/\s+/).filter(w => 
        rep.split(/\s+/).includes(w) && w.length > 4
      ).length / Math.max(answer.split(/\s+/).length, rep.split(/\s+/).length, 1);
      
      // If similar enough, add to group
      if (lengthDiff < 0.5 && hasCommonWords > 0.3) {
        group.push(answer);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      groups.push([answer]);
    }
  }

  // Find largest group (majority)
  const majorityGroup = groups.reduce((max, group) => 
    group.length > max.length ? group : max, groups[0] || []);
  
  const majoritySize = majorityGroup.length;
  const consistency = majoritySize / answers.length;

  return { consistency, majoritySize, totalRuns: answers.length };
}

/**
 * Analyze answer consistency
 * For PF-MCP questions, also checks if answers align with tool descriptions and detects confusion
 */
function analyzeAnswers(runs, question = null) {
  if (runs.length === 0) {
    return { consistency: 1.0, isConsistent: true };
  }

  const answers = runs.map(r => r.answer || '').filter(a => a.length > 0);
  if (answers.length === 0) {
    return { consistency: 0, isConsistent: false };
  }

  // For PF-MCP questions, check if answers mention correct tools and align with descriptions
  if (question && question.category === 'tooling') {
    // Get tool results from first run (they should be the same across runs)
    const firstRun = runs.find(r => r.toolResults);
    if (firstRun && firstRun.toolResults) {
      // Extract tool names from tool results
      const toolNames = [];
      const toolDescriptions = [];
      
      // Parse tool results to extract tool info
      if (firstRun.toolResults.includes('Available PatternFly MCP tools:')) {
        const lines = firstRun.toolResults.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('- ')) {
            const match = line.match(/- (\w+):\s*(.+)/);
            if (match) {
              toolNames.push(match[1]);
              toolDescriptions.push(match[2]);
            }
          }
        }
      }
      
      // Check if answers mention the correct tools
      let toolMentionScore = 0;
      let descriptionAlignmentScore = 0;
      
      if (toolNames.length > 0) {
        // Check if each answer mentions the expected tools
        const mentionScores = answers.map(answer => {
          const lowerAnswer = answer.toLowerCase();
          const mentionedTools = toolNames.filter(tool => 
            lowerAnswer.includes(tool.toLowerCase())
          );
          return mentionedTools.length / toolNames.length;
        });
        toolMentionScore = mentionScores.reduce((a, b) => a + b, 0) / mentionScores.length;
        
        // Check if answers align with tool descriptions (simple keyword matching)
        const alignmentScores = answers.map(answer => {
          const lowerAnswer = answer.toLowerCase();
          let matches = 0;
          for (const desc of toolDescriptions) {
            // Extract key terms from description (words > 3 chars)
            const keyTerms = desc.toLowerCase()
              .split(/\s+/)
              .filter(term => term.length > 3 && !['the', 'and', 'for', 'with'].includes(term));
            const foundTerms = keyTerms.filter(term => lowerAnswer.includes(term));
            matches += foundTerms.length / Math.max(keyTerms.length, 1);
          }
          return matches / Math.max(toolDescriptions.length, 1);
        });
        descriptionAlignmentScore = alignmentScores.reduce((a, b) => a + b, 0) / alignmentScores.length;
      }
      
      // Combine tool mention and description alignment (weighted)
      const pfMcpScore = (toolMentionScore * 0.6) + (descriptionAlignmentScore * 0.4);
      
      // Use majority-rule consistency (resistant to outliers)
      const majorityConsistency = calculateMajorityConsistency(answers);
      
      // Detect confusion/misinformation
      const confusion = detectConfusion(answers, question);
      
      // Combined score: 60% majority consistency, 40% PF-MCP alignment
      // But reduce score if there's high confusion (consistently wrong answers)
      let consistency = (majorityConsistency.consistency * 0.6) + (pfMcpScore * 0.4);
      
      // Penalize for confusion: if confusion is high, reduce consistency score
      if (confusion.confusionScore > 0.5) {
        // High confusion means answers are consistently wrong
        consistency = consistency * (1 - confusion.confusionScore * 0.5); // Reduce by up to 50%
      }
      
      return {
        consistency: Math.max(0, Math.min(1, consistency)), // Clamp to 0-1
        isConsistent: consistency >= 0.7 && confusion.confusionScore < 0.5,
        answerLengths: answers.map(a => a.length),
        variance: calculateVariance(answers.map(a => a.length)),
        toolMentionScore,
        descriptionAlignmentScore,
        pfMcpAlignment: pfMcpScore,
        majorityConsistency: majorityConsistency.consistency,
        majoritySize: majorityConsistency.majoritySize,
        totalRuns: majorityConsistency.totalRuns,
        confusion: confusion
      };
    }
  }

  // Fallback: Simple consistency check based on answer length (for baseline questions)
  // Use majority-rule for baseline questions too
  const majorityConsistency = calculateMajorityConsistency(answers);
  const lengths = answers.map(a => a.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = calculateVariance(lengths);
  const lengthConsistency = variance < avgLength * 0.3 ? 1.0 : Math.max(0, 1 - (variance / avgLength));
  
  // Combine majority consistency with length consistency
  const consistency = (majorityConsistency.consistency * 0.7) + (lengthConsistency * 0.3);

  return {
    consistency,
    isConsistent: consistency >= 0.7,
    answerLengths: lengths,
    variance,
    majorityConsistency: majorityConsistency.consistency,
    majoritySize: majorityConsistency.majoritySize
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
export async function runAudit(config, abortSignal = null) {
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
  let model;
  try {
    model = await initializeModel(config);
  } catch (error) {
    console.warn(`   ⚠️  Model initialization failed: ${error.message}`);
    console.warn('   Using mock model for development');
    model = createMockModel();
  }

  // Run audit runs with interrupt checking
  const allResults = [];
  
  // Check for interrupt signal periodically
  const checkInterrupt = () => {
    return abortSignal?.aborted || false;
  };

  try {
    for (let run = 1; run <= config.audit.runs; run++) {
      if (checkInterrupt()) {
        console.log(`\n⚠️  Audit interrupted at run ${run}/${config.audit.runs}`);
        break;
      }

      const results = await runAuditRun(run, questions, model, config);
      allResults.push(...results);

      // Small delay between runs (check for interrupt during delay)
      if (run < config.audit.runs) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 500);
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          }
        }).catch(() => {
          // Ignore abort errors during delay
        });
        
        if (checkInterrupt()) {
          console.log(`\n⚠️  Audit interrupted at run ${run}/${config.audit.runs}`);
          break;
        }
      }
    }
  } finally {
    // Cleanup model
    if (model && model.close) {
      try {
        await model.close();
      } catch (error) {
        console.warn(`   ⚠️  Error closing model: ${error.message}`);
      }
    }
  }

  // Analyze consistency
  console.log('\n📊 Analyzing consistency...');
  const analysis = analyzeConsistency(allResults, questions);

  return {
    config,
    healthChecks,
    questions,
    results: allResults,
    analysis,
    timestamp: new Date().toISOString()
  };
}

