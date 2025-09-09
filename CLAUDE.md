# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## 必须遵守的规则
- 每次新增功能时，必须通过 task-master add-task 任务
- 对于新增功能时，必须严格遵守先创建最小验证程序，生成mvp文件，验证通过后，再新增功能到项目中。
- 对于修复任务时，必须通过 task-master append 任务追加修复任务
- 对于修复任务时，必须按照代码顺序，生成debug文件，精确找到问题所在，再进行代码修复，必要时可以使用test对修复部分进行测试
- 不允许使用脚本来修复代码
- 灵活使用设计模式，单个文件不允许过大，一般来说，一个文件不超过500行代码，不允许出现重复代码
- 一般来说，开发过程中禁止直接使用mock数据来调试，除非确实没问题，否则必须使用真实数据来调试，防止到生产环境出现不可预估的错误
- 每次publish时，新增 task，专门用于版本的发布，必须更新所有文档，保持文档中的表述是正确的，尤其是命令，一些特性必须更新上去，逻辑结构清晰，每句话必须在在程序中得到验证