// SkillSystem - Manages skills/plugins for the Nezha agent system

export interface Skill {
  name: string;
  description: string;
  execute: (input: unknown) => Promise<unknown>;
}

export class SkillSystem {
  private skills: Map<string, Skill> = new Map();

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  listSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  async executeSkill(name: string, input: unknown): Promise<unknown> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    return skill.execute(input);
  }
}
