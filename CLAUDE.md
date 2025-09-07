# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## 必须遵守的规则
- 每次新增功能时，必须通过 task-master add-task 任务
- 对于新增功能时，必须严格遵守先创建最小验证程序，生成mvp文件，验证通过后，再新增功能到项目中。
- 对于修复任务时，必须通过 task-master append 任务追加修复任务
- 对于修复任务时，必须按照代码顺序，生成debug文件，精确找到修复的代码位置，再新增test文件，确实没问题后再修复代码本事