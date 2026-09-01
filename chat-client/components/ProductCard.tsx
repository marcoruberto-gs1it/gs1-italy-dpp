/*
 * Copyright 2026 UCP Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type React from "react";
import type { Product } from "../types";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart }) => {
  const isAvailable = product.offers.availability.includes("InStock");

  // Formato italiano con due decimali sempre: nel catalogo il prezzo arriva come "19.9"
  // e senza formattazione finirebbe a schermo come "19,9".
  const amount = Number(product.offers.price);
  const price = Number.isFinite(amount)
    ? new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: product.offers.priceCurrency || "EUR",
      }).format(amount)
    : String(product.offers.price ?? "");

  return (
    <article className="product-card">
      <div className="product-card-media">
        <img src={product.image?.[0]} alt={product.name} loading="lazy" />
        {/* Il badge dice se quel prodotto pubblica davvero una scheda dati strutturata —
            non è decorativo. L'agente può proporre anche prodotti che non ne hanno (sono
            16 in catalogo, di proposito), e mostrarli tutti come "Dati verificati"
            nasconderebbe proprio quella differenza. */}
        {product.aiReady ? (
          <span className="gs-badge gs-badge--ai">Dati verificati</span>
        ) : (
          <span className="gs-badge gs-badge--neutral" title="Questo prodotto non pubblica una scheda dati strutturata">
            Info di base
          </span>
        )}
      </div>

      <div className="product-card-body">
        <span className="product-card-brand">{product.brand?.name}</span>
        <h3 className="product-card-title" title={product.name}>
          {product.name}
        </h3>
        <span className="product-card-gtin">GTIN {product.gtin}</span>

        <div className="product-card-foot">
          <span className="product-card-price">{price}</span>
          <button
            type="button"
            className="product-card-add"
            onClick={() => onAddToCart?.(product)}
            disabled={!isAvailable || !onAddToCart}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {isAvailable ? "Aggiungi" : "Non disponibile"}
          </button>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
