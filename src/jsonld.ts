// Minimal schema.org JSON-LD reader. It only looks for LocalBusiness-like nodes.

export interface SiteBusiness {
  types: string[];
  name?: string;
  telephone?: string;
  /** Flattened to one line. */
  address?: string;
}

export interface JsonLdResult {
  blocks: number;
  invalidBlocks: number;
  businesses: SiteBusiness[];
}

const SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

// schema.org has many LocalBusiness subtypes. These are the common ones. Any other
// typed node that carries an address and a phone number is accepted as well.
const LOCAL_BUSINESS_TYPES = new Set(
  [
    'LocalBusiness', 'AnimalShelter', 'ArchiveOrganization', 'AutomotiveBusiness', 'AutoRepair', 'AutoDealer',
    'ChildCare', 'Dentist', 'DryCleaningOrLaundry', 'EmergencyService', 'EmploymentAgency', 'EntertainmentBusiness',
    'FinancialService', 'AccountingService', 'InsuranceAgency', 'FoodEstablishment', 'Bakery', 'BarOrPub', 'Brewery',
    'CafeOrCoffeeShop', 'FastFoodRestaurant', 'IceCreamShop', 'Restaurant', 'Winery', 'GovernmentOffice',
    'HealthAndBeautyBusiness', 'BeautySalon', 'DaySpa', 'HairSalon', 'NailSalon', 'HomeAndConstructionBusiness',
    'Electrician', 'GeneralContractor', 'HVACBusiness', 'Locksmith', 'MovingCompany', 'Plumber', 'RoofingContractor',
    'InternetCafe', 'LegalService', 'Attorney', 'Notary', 'Library', 'LodgingBusiness', 'Hotel', 'MedicalBusiness',
    'MedicalClinic', 'Optician', 'Pharmacy', 'Physician', 'VeterinaryCare', 'ProfessionalService', 'RealEstateAgent',
    'RecyclingCenter', 'SelfStorage', 'ShoppingCenter', 'SportsActivityLocation', 'ExerciseGym', 'HealthClub', 'Store',
    'BikeStore', 'BookStore', 'ClothingStore', 'ConvenienceStore', 'ElectronicsStore', 'Florist', 'FurnitureStore',
    'GardenStore', 'GroceryStore', 'HardwareStore', 'JewelryStore', 'PetStore', 'ShoeStore', 'SportingGoodsStore',
    'ToyStore', 'TouristInformationCenter', 'TravelAgency', 'Preschool',
  ].map((type) => type.toLowerCase()),
);

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (isRecord(value)) return text(value['name'] ?? value['@value']);
  return undefined;
}

/** Top-level nodes of a parsed JSON-LD document, with arrays and @graph unpacked. */
export function flattenNodes(doc: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const item of asArray(doc)) {
    if (!isRecord(item)) continue;
    if (item['@graph'] !== undefined) out.push(...flattenNodes(item['@graph']));
    if (item['@type'] !== undefined) out.push(item);
  }
  return out;
}

function typesOf(node: Record<string, unknown>): string[] {
  return asArray(node['@type'])
    .filter((type): type is string => typeof type === 'string')
    .map((type) => type.replace(/^https?:\/\/schema\.org\//, '').replace(/^schema:/, ''));
}

export function flattenAddress(address: unknown): string | undefined {
  const first = Array.isArray(address) ? address[0] : address;
  if (typeof first === 'string') return first.trim() || undefined;
  if (!isRecord(first)) return undefined;
  // Region and country are left out on purpose: sites and listings spell them differently.
  const parts = [first['streetAddress'], first['addressLocality'], first['postalCode']].map(text).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function toBusiness(node: Record<string, unknown>): SiteBusiness | undefined {
  const types = typesOf(node);
  const telephone = text(node['telephone']);
  const address = flattenAddress(node['address']);
  const known = types.some((type) => LOCAL_BUSINESS_TYPES.has(type.toLowerCase()));
  if (!known && !(address && telephone)) return undefined;
  const business: SiteBusiness = { types };
  const name = text(node['name']);
  if (name) business.name = name;
  if (telephone) business.telephone = telephone;
  if (address) business.address = address;
  return business;
}

export function parseJsonLd(html: string): JsonLdResult {
  const result: JsonLdResult = { blocks: 0, invalidBlocks: 0, businesses: [] };
  for (const match of html.matchAll(SCRIPT_RE)) {
    result.blocks += 1;
    let doc: unknown;
    try {
      doc = JSON.parse((match[1] ?? '').trim());
    } catch {
      result.invalidBlocks += 1;
      continue;
    }
    for (const node of flattenNodes(doc)) {
      const business = toBusiness(node);
      if (business) result.businesses.push(business);
    }
  }
  return result;
}
