# 验证报告模板
#
# 用途:`.planning/build/verification.md`

---

```markdown
---
status: passed | gaps_found
verified_at: [ISO timestamp]
inputs:
  - openapi.yaml
  - event-flow.md
  - fill-report.md
---

# 验证报告

## 状态:`passed` / `gaps_found`

## OpenAPI 契约符合性

| 端点 | 实现? | 请求 schema | 响应 schema | 错误响应 |
|------|-------|------------|------------|----------|
| GET /resources | ✅ | ✅ | ✅ | ✅ |
| POST /resources | ✅ | ✅ | ✅ | ✅ |
| GET /resources/:id | ✅ | ✅ | ✅ | ✅ |
| PUT /resources/:id | ✅ | ✅ | ✅ | ✅ |
| DELETE /resources/:id | ✅ | ✅ | ✅ | ✅ |

**契约符合度:100%(5/5 端点)**

## 流程图符合性

| 事件 | 链路连通? | 状态机正确? | 错误处理? |
|------|----------|------------|----------|
| resource.created | ✅ | ✅ | ✅ |

**流程符合度:100%**

## 测试

- 单元测试:45/45 通过(覆盖率 N%)
- 集成测试:12/12 通过
- 流程测试:3/3 通过

## 构建

- Lint:0 错误
- 类型检查:0 错误
- 构建:成功

## 结论

✅ **passed** —— 所有契约符合,所有测试通过,可交付。

或

⚠️ **gaps_found** —— 存在差异:

1. [差异 1]:[位置] [期望 vs 实际] [影响] [修复建议]
2. [差异 2]:...

## 差距修复建议(若 gaps_found)

- 生成修复 PLAN,优先级:critical > high > medium > low
- 关键路径上的差异必须修复,边缘情况差异可标记为 known-issue
```

---

<purpose>

验证报告是**契约符合性的客观证据**。

**问题它解决:** 不知道"AI 实现的代码是否真的符合讨论阶段定下的契约"。

**解决方案:** 系统对照 OpenAPI(端点、schema、错误码)和流程图(事件链路、状态机),逐一检查。

**关键原则:** 客观、可重现——所有结论都有命令输出或文件引用支持。

</purpose>