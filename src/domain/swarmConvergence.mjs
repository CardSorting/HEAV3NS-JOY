/** [LAYER: DOMAIN] */
/**
 * Multi-agent convergence engine substrate. Implements multi-role priority lattice consensus (PRIORITY_LATTICE), BFT phase filtering,
 * conflict detection, and decision resolution for multi-agent swarm task outputs.
 */
export const PRIORITY_LATTICE = {
    "product-strategist": 5,
    "accessibility-reviewer": 4,
    "ux-architect": 3,
    "design-system-engineer": 2,
    "visual-systems-designer": 1,
    "interaction-designer": 1,
    "frontend-implementation-designer": 1,
    "product-critic": 0,
};
export class ConvergenceEngineSubstrate {
    /**
     * Evaluates role priority according to the PRIORITY_LATTICE map.
     */
    static getRolePriority(role) {
        return PRIORITY_LATTICE[role.toLowerCase()] ?? 1;
    }
    /**
     * Filters out low-confidence refinements (BFT Phase 1 filtering).
     */
    applyBFTFiltering(refinements, minConfidence = 0.5) {
        return refinements.filter((r) => r.confidence >= minConfidence);
    }
    /**
     * Resolves conflicts between overlapping agent refinements based on priority lattice scores.
     */
    converge(refinements) {
        const valid = this.applyBFTFiltering(refinements);
        const fileGroupMap = new Map();
        for (const r of valid) {
            const key = r.targetFile || "global";
            const existing = fileGroupMap.get(key) ?? [];
            existing.push(r);
            fileGroupMap.set(key, existing);
        }
        const decisions = [];
        const resolvedConflicts = [];
        for (const [key, group] of fileGroupMap.entries()) {
            if (group.length === 1) {
                const item = group[0];
                decisions.push({
                    id: item.id,
                    role: item.role,
                    recommendation: item.recommendation,
                    rationale: item.rationale,
                    priorityScore: ConvergenceEngineSubstrate.getRolePriority(item.role),
                });
            }
            else {
                // Sort by role priority descending, then confidence descending
                group.sort((a, b) => {
                    const pA = ConvergenceEngineSubstrate.getRolePriority(a.role);
                    const pB = ConvergenceEngineSubstrate.getRolePriority(b.role);
                    if (pA !== pB)
                        return pB - pA;
                    return b.confidence - a.confidence;
                });
                const winner = group[0];
                decisions.push({
                    id: winner.id,
                    role: winner.role,
                    recommendation: winner.recommendation,
                    rationale: winner.rationale,
                    priorityScore: ConvergenceEngineSubstrate.getRolePriority(winner.role),
                });
                resolvedConflicts.push({
                    refinementIds: group.map((g) => g.id),
                    winningRole: winner.role,
                    resolution: `Target '${key}': Selected recommendation from '${winner.role}'`,
                    rationale: winner.rationale,
                });
            }
        }
        return { decisions, resolvedConflicts };
    }
}
