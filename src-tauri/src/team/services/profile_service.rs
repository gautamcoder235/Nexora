use crate::team::models::AgentProfile;

pub struct ProfileService;

impl ProfileService {
    pub fn new() -> Self {
        ProfileService
    }

    pub fn validate_profile(&self, _profile: &AgentProfile) -> Result<(), String> {
        Ok(())
    }
}
