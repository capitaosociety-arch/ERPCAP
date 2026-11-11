export type ProductSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'category-asc'
  | 'stock-asc'
  | 'stock-desc'
  | 'low-stock';

export const PRODUCT_SORT_OPTIONS: { value: ProductSortOption; label: string }[] = [
  { value: 'name-asc', label: 'Nome (A–Z)' },
  { value: 'name-desc', label: 'Nome (Z–A)' },
  { value: 'category-asc', label: 'Categoria (A–Z)' },
  { value: 'stock-asc', label: 'Quantidade em estoque (menor para maior)' },
  { value: 'stock-desc', label: 'Quantidade em estoque (maior para menor)' },
  { value: 'low-stock', label: 'Estoque baixo' },
];

type ProductLike = {
  id?: string | null;
  name?: string | null;
  category?: { name?: string | null } | null;
};

type SortOptions<T> = {
  getQuantity?: (product: T) => number | null | undefined;
  getMinQuantity?: (product: T) => number | null | undefined;
};

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function productName(product: ProductLike): string {
  return text(product.name);
}

function categoryName(product: ProductLike): string {
  return text(product.category?.name) || 'Sem categoria';
}

function productId(product: ProductLike): string {
  return text(product.id);
}

function quantityOf<T>(product: T, options: SortOptions<T>): number {
  const value = Number(options.getQuantity?.(product));
  return Number.isFinite(value) ? value : 0;
}

function minQuantityOf<T>(product: T, options: SortOptions<T>): number {
  const value = Number(options.getMinQuantity?.(product));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isLowStock<T>(product: T, options: SortOptions<T>): boolean {
  const quantity = quantityOf(product, options);
  const min = minQuantityOf(product, options);
  if (min > 0 && quantity <= min) return true;
  return quantity <= 0;
}

export function sortProducts<T extends ProductLike>(
  products: readonly T[],
  option: ProductSortOption = 'name-asc',
  options: SortOptions<T> = {}
): T[] {
  const sorted = [...products];

  const byNameAsc = (a: T, b: T) => collator.compare(productName(a), productName(b));
  const byIdAsc = (a: T, b: T) => collator.compare(productId(a), productId(b));

  sorted.sort((a, b) => {
    let primary = 0;

    if (option === 'name-desc') {
      primary = collator.compare(productName(b), productName(a));
    } else if (option === 'category-asc') {
      primary = collator.compare(categoryName(a), categoryName(b));
    } else if (option === 'stock-asc' || option === 'stock-desc') {
      primary = quantityOf(a, options) - quantityOf(b, options);
      if (option === 'stock-desc') primary = -primary;
    } else if (option === 'low-stock') {
      const aLow = isLowStock(a, options) ? 0 : 1;
      const bLow = isLowStock(b, options) ? 0 : 1;
      primary = aLow - bLow;
      if (primary === 0) primary = quantityOf(a, options) - quantityOf(b, options);
    } else {
      primary = byNameAsc(a, b);
    }

    if (primary !== 0) return primary;
    if (option !== 'name-asc' && option !== 'name-desc') {
      const secondary = byNameAsc(a, b);
      if (secondary !== 0) return secondary;
    }
    return byIdAsc(a, b);
  });

  return sorted;
}
