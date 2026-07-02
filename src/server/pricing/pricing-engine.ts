// Help Bibi — Pricing Engine
export type ServiceType = 'reboque' | 'pneu' | 'bateria' | 'combustivel' | 'chaveiro' | 'pane'
export type LatLng = { lat: number; lng: number }

export type PricingConfig = { serviceType: ServiceType; baseFare: number; pricePerKm: number; minimumFare: number; destinationPricePerKm: number; nightSurchargePercent: number; weekendSurchargePercent: number; platformFeePercent: number; providerPayoutPercent: number }
export type PricingInput = { serviceType: ServiceType; pickup: LatLng; destination: LatLng | null; providerPosition: LatLng | null; pickupDistanceKm?: number; destinationDistanceKm?: number; datetime?: Date; city?: string; promoCode?: string | null; promoType?: 'percent' | 'fixed' | null; promoValue?: number | null }
export type PriceBreakdown = { baseFare: number; pickupDistanceKm: number; pickupDistanceCost: number; destinationDistanceKm: number; destinationDistanceCost: number; subtotal: number; surchargeAmount: number; surchargeLabel: string; beforeDiscount: number; discountAmount: number; discountLabel: string; total: number; platformFee: number; providerPayout: number; minimumFareApplied: boolean; breakdownText: string[] }

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export const DEFAULT_PRICING: Record<ServiceType, PricingConfig> = {
  reboque: { serviceType:'reboque', baseFare:120, pricePerKm:4, minimumFare:180, destinationPricePerKm:6, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
  pneu: { serviceType:'pneu', baseFare:80, pricePerKm:4, minimumFare:100, destinationPricePerKm:0, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
  bateria: { serviceType:'bateria', baseFare:90, pricePerKm:4, minimumFare:110, destinationPricePerKm:0, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
  combustivel: { serviceType:'combustivel', baseFare:70, pricePerKm:4, minimumFare:90, destinationPricePerKm:0, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
  chaveiro: { serviceType:'chaveiro', baseFare:100, pricePerKm:5, minimumFare:130, destinationPricePerKm:0, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
  pane: { serviceType:'pane', baseFare:100, pricePerKm:5, minimumFare:140, destinationPricePerKm:0, nightSurchargePercent:15, weekendSurchargePercent:10, platformFeePercent:20, providerPayoutPercent:80 },
}

const haversineKm = (a: LatLng, b: LatLng) => { const R=6371; const dLat=((b.lat-a.lat)*Math.PI)/180; const dLng=((b.lng-a.lng)*Math.PI)/180; const la1=(a.lat*Math.PI)/180; const la2=(b.lat*Math.PI)/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)) }

export function calculatePrice(input: PricingInput): PriceBreakdown {
  const config = DEFAULT_PRICING[input.serviceType]
  const now = input.datetime || new Date()
  const hour = now.getHours(); const isWeekend = now.getDay()===0||now.getDay()===6; const isNight = hour>=22||hour<6
  const pickupDistanceKm = input.pickupDistanceKm ?? (input.providerPosition ? haversineKm(input.providerPosition, input.pickup) : 0)
  const destinationDistanceKm = input.destinationDistanceKm ?? (input.destination ? haversineKm(input.pickup, input.destination) : 0)
  const pickupDistanceCost = round2(pickupDistanceKm * config.pricePerKm)
  const destinationDistanceCost = round2(destinationDistanceKm * config.destinationPricePerKm)
  let subtotal = round2(config.baseFare + pickupDistanceCost + destinationDistanceCost)
  let minimumFareApplied = false
  if (subtotal < config.minimumFare) { subtotal = round2(config.minimumFare); minimumFareApplied = true }
  let surchargeAmount = 0; let surchargeLabel = ''
  if (isNight && config.nightSurchargePercent > 0) { surchargeAmount = round2((subtotal * config.nightSurchargePercent)/100); surchargeLabel = `Adicional noturno (${config.nightSurchargePercent}%)` }
  else if (isWeekend && config.weekendSurchargePercent > 0) { surchargeAmount = round2((subtotal * config.weekendSurchargePercent)/100); surchargeLabel = `Adicional fim de semana (${config.weekendSurchargePercent}%)` }
  const beforeDiscount = round2(subtotal + surchargeAmount)
  let discountAmount = 0; let discountLabel = ''
  if (input.promoCode && input.promoType && input.promoValue) {
    if (input.promoType === 'percent') { discountAmount = round2((beforeDiscount * input.promoValue)/100); discountLabel = `Cupom ${input.promoCode} (${input.promoValue}%)` }
    else if (input.promoType === 'fixed') { discountAmount = Math.min(round2(input.promoValue), beforeDiscount); discountLabel = `Cupom ${input.promoCode} (R$ ${input.promoValue.toFixed(2).replace('.',',')})` }
  }
  const total = round2(Math.max(0, beforeDiscount - discountAmount))
  const platformFee = round2((total * config.platformFeePercent)/100)
  const providerPayout = round2(total - platformFee)
  const fmt = (n:number) => n.toFixed(2).replace('.',',')
  const breakdownText: string[] = [`Tarifa base: R$ ${fmt(config.baseFare)}`, `Deslocamento até cliente (${pickupDistanceKm.toFixed(1)} km): R$ ${fmt(pickupDistanceCost)}`]
  if (destinationDistanceCost > 0) breakdownText.push(`Trajeto até destino (${destinationDistanceKm.toFixed(1)} km): R$ ${fmt(destinationDistanceCost)}`)
  if (minimumFareApplied) breakdownText.push(`Tarifa mínima aplicada: R$ ${fmt(config.minimumFare)}`)
  if (surchargeAmount > 0) breakdownText.push(`${surchargeLabel}: R$ ${fmt(surchargeAmount)}`)
  if (discountAmount > 0) breakdownText.push(`${discountLabel}: -R$ ${fmt(discountAmount)}`)
  breakdownText.push(`Total: R$ ${fmt(total)}`)
  breakdownText.push(`Taxa da plataforma (${config.platformFeePercent}%): R$ ${fmt(platformFee)}`)
  breakdownText.push(`Repasse ao prestador (${config.providerPayoutPercent}%): R$ ${fmt(providerPayout)}`)
  return { baseFare: round2(config.baseFare), pickupDistanceKm: Number(pickupDistanceKm.toFixed(2)), pickupDistanceCost, destinationDistanceKm: Number(destinationDistanceKm.toFixed(2)), destinationDistanceCost, subtotal, surchargeAmount, surchargeLabel, beforeDiscount, discountAmount, discountLabel, total, platformFee, providerPayout, minimumFareApplied, breakdownText }
}

export function formatBRL(n: number): string { return `R$ ${n.toFixed(2).replace('.',',')}` }
export function getPricingConfig(serviceType: ServiceType): PricingConfig { return DEFAULT_PRICING[serviceType] }
export function getAllPricingConfigs(): PricingConfig[] { return Object.values(DEFAULT_PRICING) }
