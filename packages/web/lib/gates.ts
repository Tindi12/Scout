export type ProEntitlement = {
  isPro: boolean
}

export function isProUser(entitlement: ProEntitlement): boolean {
  return entitlement.isPro
}

export function assertPro(entitlement: ProEntitlement): void {
  if (!entitlement.isPro) {
    throw new Error('Pro subscription required')
  }
}
