'use server'

export type TargetRole =
  | 'swe'
  | 'ml'
  | 'data_eng'
  | 'devops'
  | 'product'
  | 'research'
  | 'chem_eng'
  | 'mech_eng'
  | 'elec_eng'
  | 'civil_eng'
  | 'bio_eng'
  | 'industrial_eng'

export type OnboardingData = {
  name: string
  school: string
  grad_year: number
  gpa?: number
  target_roles: TargetRole[]
  phone_number?: string
}

export async function completeOnboarding(data: OnboardingData) {
  // implementation coming — we write this ourselves
  console.log('onboarding data:', data)
}
