// [LAYER: DOMAIN]
// Pure Domain trait contract and value object in Rust (0% I/O).

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuotaPolicy {
    pub max_requests_per_minute: u32,
}

impl QuotaPolicy {
    pub fn is_allowed(&self, current_count: u32) -> bool {
        current_count < self.max_requests_per_minute
    }
}

pub trait IQuotaStore {
    fn current_usage(&self, tenant_id: &str) -> u32;
    fn increment(&mut self, tenant_id: &str) -> u32;
}

