# Controller-cost attribution profile

This profiling-only probe belongs to performance epic #56 and follows the measured #90/#92 runtime improvements.

The owner-selected real-workload guardrails remain:

- ordered Active Elastic, using the existing hexagonal initialization;
- disordered Simple Random Walk, using the existing random initializer.

The existing browser profile continues to report both real workloads unchanged. The additional `controller-cost-profile.mjs` probe runs only the ordered Active Elastic setup and substitutes controller programs of decreasing computational complexity. Its purpose is software attribution: distinguish remaining controller-interpreter/dispatch overhead from the cost of numerical intrinsics such as `norm` and `pow` before selecting another production optimization.

The probe does not change production behavior, experiment parameters, scientific semantics, or the public controller IR contract. Results are performance evidence only and must not be interpreted as scientific validation or retuning.
