"""提示词模板"""

from __future__ import annotations

# 标准问答提示词
QA_PROMPT_TEMPLATE = """你是一个专业的企业知识库智能助手。你的任务是基于提供的参考文档片段，准确、简洁地回答用户的问题。

## 指导原则
1. 仅基于提供的参考文档回答，不要编造信息
2. 如果参考文档不足以回答问题，请明确告知用户
3. 在回答中引用具体的文档来源，使用 [来源: 文档名称] 格式
4. 使用中文回答，除非文档内容是英文
5. 保持回答的专业性和准确性

## 参考文档
{context_str}

## 对话历史
{chat_history}

## 用户问题
{query_str}

## 回答
"""

# 精简问答提示词 (用于 API 调用)
SIMPLE_QA_PROMPT = """基于以下文档内容回答问题。如果内容不足以回答，请说明。

文档内容:
{context}

问题: {question}

回答:"""

# 摘要提示词
SUMMARIZE_PROMPT = """请对以下内容进行简洁的摘要，保留关键信息:

{text}

摘要:"""

# 文档分析提示词
ANALYSIS_PROMPT = """请分析以下文档内容，提取:
1. 核心观点
2. 关键数据
3. 主要结论

文档内容:
{text}

分析结果:"""

PROMPT_TEMPLATES = {
    "qa": QA_PROMPT_TEMPLATE,
    "simple_qa": SIMPLE_QA_PROMPT,
    "summarize": SUMMARIZE_PROMPT,
    "analysis": ANALYSIS_PROMPT,
}
