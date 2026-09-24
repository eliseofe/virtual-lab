pub const RNG_CONTRACT_VERSION: &str = "vlab.rng/splitmix64-domain/1";
pub const RNG_DOMAIN_INITIALIZATION: &str = "initialization";
pub const RNG_DOMAIN_SENSING: &str = "sensing";
pub const RNG_DOMAIN_CONTROLLER: &str = "controller";

const SPLITMIX_GAMMA: u64 = 0x9E3779B97F4A7C15;
const SPLITMIX_MUL1: u64 = 0xBF58476D1CE4E5B9;
const SPLITMIX_MUL2: u64 = 0x94D049BB133111EB;
const FNV1A_OFFSET: u64 = 0xCBF29CE484222325;
const FNV1A_PRIME: u64 = 0x100000001B3;

fn splitmix64_finalizer(mut value: u64) -> u64 {
    value = (value ^ (value >> 30)).wrapping_mul(SPLITMIX_MUL1);
    value = (value ^ (value >> 27)).wrapping_mul(SPLITMIX_MUL2);
    value ^ (value >> 31)
}

fn ascii_fnv1a64(label: &str) -> Result<u64, String> {
    if label.is_empty() || !label.bytes().all(|byte| (0x20..=0x7e).contains(&byte)) {
        return Err("scientific RNG domain must be a non-empty printable ASCII string".to_owned());
    }
    let mut hash = FNV1A_OFFSET;
    for byte in label.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV1A_PRIME);
    }
    Ok(hash)
}

pub fn derive_scientific_stream_seed(
    root_seed: u32,
    domain: &str,
    stream_index: u64,
) -> Result<u64, String> {
    let root = root_seed as u64;

    // v1 deliberately preserves the historical initialization stream bit-for-bit.
    // Other domains are separated from initialization and from each other.
    if domain == RNG_DOMAIN_INITIALIZATION && stream_index == 0 {
        return Ok(root);
    }

    let domain_tag = ascii_fnv1a64(domain)?;
    let stream_tag = stream_index.wrapping_mul(SPLITMIX_GAMMA);
    Ok(splitmix64_finalizer(root ^ domain_tag ^ stream_tag))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScientificRng {
    state: u64,
}

impl ScientificRng {
    pub fn from_seed_state(seed_state: u64) -> Self {
        Self { state: seed_state }
    }

    pub fn for_domain(root_seed: u32, domain: &str, stream_index: u64) -> Result<Self, String> {
        Ok(Self::from_seed_state(derive_scientific_stream_seed(
            root_seed,
            domain,
            stream_index,
        )?))
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(SPLITMIX_GAMMA);
        splitmix64_finalizer(self.state)
    }

    pub fn unit(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) * (1.0 / ((1u64 << 53) as f64))
    }

    pub fn signed(&mut self) -> f64 {
        self.unit() * 2.0 - 1.0
    }

    pub fn uniform(&mut self, a: f64, b: f64) -> Result<f64, String> {
        if !a.is_finite() || !b.is_finite() {
            return Err("scientific RNG uniform bounds must be finite".to_owned());
        }
        Ok(a + (b - a) * self.unit())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_conformance_vectors_match_the_cross_runtime_contract() {
        let mut initialization =
            ScientificRng::for_domain(2026, RNG_DOMAIN_INITIALIZATION, 0).unwrap();
        assert_eq!(
            [
                initialization.next_u64(),
                initialization.next_u64(),
                initialization.next_u64(),
            ],
            [0xDB9C559891948D23, 0x78BC927DED35455D, 0xAAD71E75CDE2B88E,]
        );

        assert_eq!(
            derive_scientific_stream_seed(2026, RNG_DOMAIN_SENSING, 0).unwrap(),
            0x47FDC51ABF391476
        );
        let mut sensing = ScientificRng::for_domain(2026, RNG_DOMAIN_SENSING, 0).unwrap();
        assert_eq!(
            [sensing.next_u64(), sensing.next_u64(), sensing.next_u64(),],
            [0xACB00A4D94376943, 0xD1950AA56F146E6C, 0xA1739EB99746500B,]
        );

        assert_eq!(
            derive_scientific_stream_seed(2026, RNG_DOMAIN_CONTROLLER, 0).unwrap(),
            0x9D24ED0D15C2C6F3
        );
        assert_eq!(
            derive_scientific_stream_seed(2026, RNG_DOMAIN_CONTROLLER, 1).unwrap(),
            0x90AA42631D02B494
        );
    }

    #[test]
    fn initialization_keeps_the_historical_root_stream() {
        assert_eq!(
            derive_scientific_stream_seed(0, RNG_DOMAIN_INITIALIZATION, 0).unwrap(),
            0
        );
        assert_eq!(
            derive_scientific_stream_seed(u32::MAX, RNG_DOMAIN_INITIALIZATION, 0).unwrap(),
            u32::MAX as u64
        );
    }

    #[test]
    fn domain_and_stream_separation_are_draw_count_independent() {
        let mut sensing = ScientificRng::for_domain(2026, RNG_DOMAIN_SENSING, 0).unwrap();
        let controller_before = ScientificRng::for_domain(2026, RNG_DOMAIN_CONTROLLER, 7)
            .unwrap()
            .next_u64();
        for _ in 0..1000 {
            sensing.next_u64();
        }
        let controller_after = ScientificRng::for_domain(2026, RNG_DOMAIN_CONTROLLER, 7)
            .unwrap()
            .next_u64();
        assert_eq!(controller_before, controller_after);
        assert_ne!(
            derive_scientific_stream_seed(2026, RNG_DOMAIN_CONTROLLER, 7).unwrap(),
            derive_scientific_stream_seed(2026, RNG_DOMAIN_CONTROLLER, 8).unwrap()
        );
    }
}
