import axios, { AxiosInstance } from 'axios';
import { ConversationLogger } from './ConversationLogger.js';

export interface OpenCodeConfig {
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  providerId: string;
}

export interface OpenCodeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenCodeResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

export class OpenCodeClient {
  private client: AxiosInstance;
  private config: OpenCodeConfig;
  private conversationLogger: ConversationLogger;

  constructor(config: OpenCodeConfig, conversationLogger: ConversationLogger) {
    this.config = config;
    this.conversationLogger = conversationLogger;
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
    });
  }

  async sendMessage(
    messages: OpenCodeMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    try {
      const response = await this.client.post<OpenCodeResponse>('/chat/completions', {
        model: this.config.modelId,
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 4000,
        stream: options?.stream || false,
      });

      const content = response.data.choices[0]?.message?.content || '';
      
      return content;
    } catch (error) {
      throw new Error(`OpenCode API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeTask(
    task: {
      id: string;
      title: string;
      description: string;
    },
    context?: string
  ): Promise<{
    success: boolean;
    output: string;
    artifacts: string[];
  }> {
    const sessionId = this.conversationLogger.startConversation(task, 'task_execution');

    try {
      const systemPrompt = `You are an AI assistant helping with software development tasks.
You have access to the Nezha system which provides:
- Memory system for storing and retrieving knowledge
- Semantic search for finding relevant past experiences (use semantic_search function when you need to recall similar ta
  sks or solutions)
- Task scheduling and execution
- Conversation logging for learning

When you need to find relevant past experiences or similar solutions, use the semantic_search function to search through
   your memory.

Current task: ${task.title}
Description: ${task.description}

${context ? `Context: ${context}` : ''}

Please analyze the task and provide a detailed solution.`;

      const messages: OpenCodeMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please help me with this task: ${task.description}` },
      ];

      this.conversationLogger.addMessage('user', `Task: ${task.title}`);

      const response = await this.sendMessage(messages);
      
      this.conversationLogger.addMessage('assistant', response);

      const result = {
        success: true,
        output: response,
        artifacts: this.extractArtifacts(response),
      };

      this.conversationLogger.endConversation(result);

      return result;
    } catch (error) {
      const result = {
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
        artifacts: [],
      };

      this.conversationLogger.endConversation(result);

      throw error;
    }
  }

  async *streamResponse(
    messages: OpenCodeMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncIterator<string> {
    try {
      const response = await this.client.post(
        '/chat/completions',
        {
          model: this.config.modelId,
          messages,
          temperature: options?.temperature || 0.7,
          max_tokens: options?.maxTokens || 4000,
          stream: true,
        },
        { responseType: 'stream' }
      );

      const stream = response.data;
      
      for await (const chunk of stream) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`OpenCode streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractArtifacts(content: string): string[] {
    const artifacts: string[] = [];
    
    const filePattern = /(?:file|created|modified|updated):\s*([^\s]+\.(ts|js|json|md|txt))/gi;
    let match;
    
    while ((match = filePattern.exec(content)) !== null) {
      artifacts.push(match[1]);
    }
    
    return artifacts;
  }
}
