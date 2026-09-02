# Prompt 版本化集中存放（面试展示点：Prompt 迭代过程可查证）
# 规范：每个 Prompt 独立文件 + 版本注释 + 对应阶段
#
# 结构建议：
#   ingest     清洗规则（少量用代码，必要时辅助 Prompt）
#   cluster/   主题命名 + 痛点提炼（few-shot 样例）
#   insight/   情感分类（JSON 输出）
#   prd_gen/   PRD 草稿生成（结构化 Markdown 模板）
#   summary/   清洗/处理摘要说明