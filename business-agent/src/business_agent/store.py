# Copyright 2026 UCP Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""UCP."""

from decimal import Decimal
from itertools import permutations
import json
import logging
import os
import time
from pathlib import Path
from uuid import uuid4
import httpx
from pydantic import AnyUrl
from ucp_sdk.models.schemas.shopping.checkout_resp import (
    CheckoutResponse as Checkout,
)
from ucp_sdk.models.schemas.shopping.fulfillment_resp import (
    Checkout as FulfillmentCheckout,
)
from ucp_sdk.models.schemas.shopping.fulfillment_resp import Fulfillment
from ucp_sdk.models.schemas.shopping.payment_resp import PaymentResponse
from ucp_sdk.models.schemas.shopping.types.fulfillment_destination_resp import (
    FulfillmentDestinationResponse,
)
from ucp_sdk.models.schemas.shopping.types.fulfillment_group_resp import (
    FulfillmentGroupResponse,
)
from ucp_sdk.models.schemas.shopping.types.fulfillment_method_resp import (
    FulfillmentMethodResponse,
)
from ucp_sdk.models.schemas.shopping.types.fulfillment_option_resp import (
    FulfillmentOptionResponse,
)
from ucp_sdk.models.schemas.shopping.types.fulfillment_resp import (
    FulfillmentResponse,
)
from ucp_sdk.models.schemas.shopping.types.item_resp import ItemResponse as Item
from ucp_sdk.models.schemas.shopping.types.line_item_resp import (
    LineItemResponse as LineItem,
)
from ucp_sdk.models.schemas.shopping.types.order_confirmation import (
    OrderConfirmation,
)
from ucp_sdk.models.schemas.shopping.types.postal_address import PostalAddress
from ucp_sdk.models.schemas.shopping.types.shipping_destination_resp import (
    ShippingDestinationResponse,
)
from ucp_sdk.models.schemas.shopping.types.total_resp import (
    TotalResponse as Total,
)
from ucp_sdk.models.schemas.ucp import ResponseCheckout as UcpMetadata
from .helpers import get_checkout_type
from .models.product_types import ImageObject, Product, ProductResults


DEFAULT_CURRENCY = "EUR"


class RetailStore:
    """Mock Retail Store for demo purposes.

    Uses in-memory data structures to store products, checkouts, and
    orders.
    """

    def __init__(self):
        """Initialize the retail store."""
        self._products = {}
        # gtin -> JSON-LD della scheda, oppure None se il prodotto non ne pubblica (404).
        # Una chiave assente significa "non ancora letta": vedi get_product_sheets.
        self._sheets = {}
        # gtin unita' base -> livelli di imballo scoperti (vedi get_packaging_levels).
        self._levels = {}
        self._catalog_url = os.getenv("CATALOG_URL", "http://localhost:8080")
        self._checkouts = {}
        self._orders = {}
        self._initialize_ucp_metadata()
        self._initialize_products()

    def _initialize_ucp_metadata(self):
        """Load UCP metadata from data/ucp.json."""
        base_path = Path(__file__).parent
        ucp_path = base_path / "data" / "ucp.json"
        with ucp_path.open() as f:
            self._ucp_metadata = json.load(f)

    def _initialize_products(self):
        """Carica il catalogo (leggero) dal servizio FastAPI GS1.

        La ricchezza GS1 (ingredienti, allergeni, nutrienti) NON viene caricata
        qui: arriva on-demand dal tool ``leggi_prodotto`` che legge il JSON-LD
        della scheda ``/01/{gtin}``. Qui teniamo solo i campi necessari a
        ricerca e checkout.
        """
        catalog_url = self._catalog_url
        for entry in self._fetch_catalog(catalog_url):
            gtin = entry.get("gtin")
            if not gtin:
                continue
            product_data = {
                "@type": "Product",
                "productID": gtin,
                "sku": gtin,
                "name": entry.get("name", gtin),
                "brand": {"@type": "Brand", "name": entry.get("brand") or "GS1"},
                "image": [entry["image"]] if entry.get("image") else None,
                "description": entry.get("description"),
                "gtin": gtin,
                "category": entry.get("category"),
                "offers": {
                    "@type": "Offer",
                    "price": entry.get("price"),
                    "priceCurrency": entry.get("priceCurrency", DEFAULT_CURRENCY),
                    "availability": "https://schema.org/InStock",
                    "itemCondition": "https://schema.org/NewCondition",
                },
            }
            product = Product.model_validate(product_data)
            self._products[product.product_id] = product
        logging.info("Catalogo caricato: %d prodotti da %s", len(self._products), catalog_url)

    def _fetch_catalog(self, catalog_url: str, retries: int = 15, delay: float = 2.0):
        """Recupera /catalog dal servizio FastAPI, con retry all'avvio."""
        last_exc: Exception | None = None
        for _ in range(retries):
            try:
                resp = httpx.get(f"{catalog_url}/catalog", timeout=5.0)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                time.sleep(delay)
        logging.error(
            "Impossibile caricare il catalogo da %s: %s", catalog_url, last_exc
        )
        return []

    def search_products(self, gtins: str = "") -> ProductResults:
        """Restituisce i prodotti del catalogo, tutti o quelli indicati.

        ADATTAMENTO rispetto al sample UCP di Google. Il sample filtrava per keyword su
        nome e categoria: sul catalogo italiano quasi ogni ricerca falliva, perche' le
        denominazioni commerciali non coincidono col linguaggio comune ("marmellata" non
        trova "Confettura"). Qui non c'e' piu' alcun filtro in Python: la selezione la fa
        il modello, leggendo le schede GS1 complete che accompagnano questi prodotti
        (vedi ``get_product_sheets``). Il codice si limita a dire cosa esiste in negozio.

        Args:
            gtins: elenco di GTIN separati da virgola; vuoto = tutto il catalogo.

        Returns:
            ProductResults: i prodotti richiesti, vuoto se nessun GTIN corrisponde.

        """
        wanted = {g.strip() for g in gtins.split(",") if g.strip()}
        results = [
            product
            for gtin, product in self._products.items()
            if not wanted or gtin in wanted
        ]

        if not results:
            return ProductResults(results=[], content="No products found")

        return ProductResults(results=results)

    def get_product_sheets(self, gtins: list[str]) -> dict:
        """Le schede GS1 in JSON-LD dei prodotti indicati, per il ragionamento del modello.

        Le legge dalla stessa URL Digital Link che pubblica la scheda al pubblico
        (``GET /01/{gtin}`` con ``Accept: application/ld+json``): l'agente ragiona
        esattamente sul documento che il sito pubblica, non su una copia rielaborata.

        I prodotti che non pubblicano dati strutturati rispondono 404 e restano fuori dal
        risultato: l'assenza e' essa stessa un'informazione, e il modello deve dichiararla
        invece di colmarla.
        """
        missing = [g for g in gtins if g not in self._sheets]
        if missing:
            with httpx.Client(timeout=10.0) as client:
                for gtin in missing:
                    self._sheets[gtin] = self._fetch_sheet(client, gtin)

        return {g: self._sheets[g] for g in gtins if self._sheets.get(g)}

    # ------------------------------------------------------------------
    # Livelli di imballo e calcolo di stoccaggio
    # ------------------------------------------------------------------

    def get_packaging_levels(self, gtin: str) -> list[dict]:
        """I livelli di imballo del prodotto: unita' base, cartone, pallet.

        Non esiste una proprieta' del GS1 Web Vocabulary che colleghi i livelli fra loro,
        e non ne inventiamo una: il legame e' gia' nei GTIN. Il primo carattere di un
        GTIN-14 e' l'*indicator digit* che per le GS1 General Specifications distingue i
        livelli di imballo dello stesso articolo commerciale (0 = unita' base,
        1..8 = livelli superiori), a parita' di item reference e con il check digit
        ricalcolato.

        Qui i livelli si scoprono percio' cosi' come li scoprirebbe un agente esterno:
        si ricostruisce il GTIN di ogni indicator digit e si chiede al sito se esiste.
        Chi risponde 404 semplicemente non e' pubblicato.

        Returns:
            list[dict]: un elemento per livello, dal piu' piccolo al piu' grande, con
            dimensioni in millimetri, pesi in kg, quantita' contenuta e volume.

        """
        if gtin in self._levels:
            return self._levels[gtin]

        candidates = [gtin] + [
            self._with_indicator_digit(gtin, digit) for digit in range(1, 9)
        ]
        sheets = self.get_product_sheets([g for g in candidates if g])

        levels = []
        for candidate in candidates:
            sheet = sheets.get(candidate)
            if not sheet:
                continue
            level = self._describe_level(candidate, sheet)
            if level:
                levels.append(level)

        # Dal piu' piccolo al piu' grande: e' l'ordine in cui ha senso proporli a chi
        # deve scegliere l'unita' di riferimento.
        levels.sort(key=lambda lv: lv["volume_m3"] or 0)

        # Quante unita' base contiene ciascun livello, moltiplicando lungo la catena:
        # il pallet dichiara 80 (cartoni), il cartone 12 (vasetti), quindi il pallet vale
        # 960 unita' base. Senza questa risalita si moltiplicherebbe il livello sbagliato.
        #
        # La catena si ricostruisce dall'ordine per volume crescente: gs1:netContent dice
        # "80 pezzi" ma non di che cosa: quale sia il livello contenuto e' informazione
        # GDSN, che il Web Vocabulary non esprime. L'assunzione — ogni livello contiene
        # quello immediatamente piu' piccolo — e' quella che regge in una gerarchia di
        # imballo reale.
        cumulative = 1
        for level in levels:
            if level["contains_units"]:
                cumulative *= level["contains_units"]
            level["total_base_units"] = cumulative

        self._levels[gtin] = levels
        return levels

    @staticmethod
    def _with_indicator_digit(gtin: str, digit: int) -> str | None:
        """Sostituisce l'indicator digit di un GTIN-14 e ricalcola il check digit."""
        if len(gtin) != 14 or not gtin.isdigit():
            return None
        body = str(digit) + gtin[1:13]
        # Check digit GS1: pesi 3 e 1 alternati da destra, complemento a 10.
        total = sum(
            int(char) * (3 if index % 2 == 0 else 1)
            for index, char in enumerate(reversed(body))
        )
        return body + str((10 - total % 10) % 10)

    @classmethod
    def _describe_level(cls, gtin: str, sheet: dict) -> dict | None:
        """Estrae dalla scheda JSON-LD i numeri che servono al calcolo di stoccaggio."""
        dimensions = [
            cls._quantity(sheet.get(prop))
            for prop in (
                "gs1:inPackageDepth",
                "gs1:inPackageWidth",
                "gs1:inPackageHeight",
            )
        ]
        if not all(dimensions):
            return None

        net_content = cls._quantity(sheet.get("gs1:netContent"))
        gross_weight = cls._quantity(sheet.get("gs1:grossWeight"))
        volume = cls._quantity(sheet.get("gs1:grossVolume"))

        name = sheet.get("name")
        if isinstance(name, list):
            name = name[0].get("@value") if isinstance(name[0], dict) else name[0]

        # Sull'unita' base il tipo di imballo e' annidato in gs1:packaging
        # (gs1:PackagingDetails), sui livelli superiori e' una proprieta' diretta.
        packaging_type = sheet.get("gs1:packagingType")
        if not packaging_type:
            packaging = sheet.get("gs1:packaging")
            if isinstance(packaging, list) and packaging:
                packaging_type = packaging[0].get("gs1:packagingType")

        return {
            "gtin": gtin,
            "name": name,
            "packaging_type": packaging_type,
            # In millimetri, senza pretendere di sapere quale asse sia l'altezza: il
            # calcolo prova tutte le orientazioni.
            "dimensions_mm": [d[0] for d in dimensions],
            "volume_m3": volume[0]
            if volume
            else round(dimensions[0][0] * dimensions[1][0] * dimensions[2][0] / 1e9, 6),
            "gross_weight_kg": cls._to_kilograms(gross_weight),
            # Quantita' dichiarata del livello inferiore contenuto (netContent in pezzi).
            "contains_units": int(net_content[0])
            if net_content and net_content[1] == "H87"
            else None,
        }

    @staticmethod
    def _quantity(node) -> tuple[float, str] | None:
        """Legge un gs1:QuantitativeValue → (valore, unitCode)."""
        if not isinstance(node, dict):
            return None
        value = node.get("value")
        if isinstance(value, dict):
            value = value.get("@value")
        try:
            return float(value), node.get("unitCode") or ""
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_kilograms(quantity: tuple[float, str] | None) -> float | None:
        if not quantity:
            return None
        value, unit = quantity
        return round(value / 1000, 3) if unit == "GRM" else value

    def compute_storage(
        self,
        gtin: str,
        level_gtin: str,
        length_mm: float,
        width_mm: float,
        height_mm: float,
    ) -> dict:
        """Quante unita' del livello indicato entrano in uno spazio dato.

        Calcolo deterministico, non affidato al modello: per ogni orientazione possibile
        della scatola (le 6 permutazioni degli assi) si divide ciascuna dimensione dello
        spazio per la corrispondente dimensione della scatola arrotondando all'intero
        inferiore, e si tiene l'orientazione che rende di piu'. E' il conto che farebbe un
        magazziniere con il metro: nessun frazionamento, nessun riempimento teorico del
        volume.

        Il risultato dichiara sempre le assunzioni: e' una capienza geometrica lorda, senza
        corridoi, senza limiti di impilamento e senza portata del piano.
        """
        levels = self.get_packaging_levels(gtin)
        level = next((lv for lv in levels if lv["gtin"] == level_gtin), None)
        if not level:
            return {"status": "error", "message": f"Livello {level_gtin} non trovato."}

        space = [length_mm, width_mm, height_mm]
        if any(not value or value <= 0 for value in space):
            return {"status": "error", "message": "Dimensioni dello spazio non valide."}

        best_count = 0
        best_layout = None
        for orientation in permutations(level["dimensions_mm"]):
            per_axis = [int(space[i] // orientation[i]) for i in range(3)]
            count = per_axis[0] * per_axis[1] * per_axis[2]
            if count > best_count:
                best_count = count
                best_layout = {
                    "orientation_mm": list(orientation),
                    "per_length": per_axis[0],
                    "per_width": per_axis[1],
                    "stacked_high": per_axis[2],
                }

        # total_base_units risale l'intera catena (un pallet = 80 cartoni x 12 vasetti),
        # quindi qui si moltiplica per le unita' base vere, non per il livello contenuto.
        base_units = best_count * level.get("total_base_units", 1)
        total_weight = (
            round(best_count * level["gross_weight_kg"], 1)
            if level["gross_weight_kg"]
            else None
        )

        return {
            "status": "success",
            "level": level,
            "space_mm": {"length": length_mm, "width": width_mm, "height": height_mm},
            "fits": best_count,
            "layout": best_layout,
            "contained_base_units": base_units,
            "total_gross_weight_kg": total_weight,
            "assumptions": [
                "Capienza geometrica lorda: nessun corridoio, nessuno spazio di manovra.",
                "Nessun limite di impilamento ne' portata del piano considerati.",
                "Orientazione scelta come la piu' capiente fra le sei possibili.",
                "Le quantita' per livello (unita' per cartone, cartoni per pallet) sono"
                " quelle dichiarate nella scheda, non ricalcolate dalle dimensioni.",
            ],
        }

    def _fetch_sheet(self, client: httpx.Client, gtin: str) -> dict | None:
        """Scarica una singola scheda JSON-LD; None se il prodotto non ne pubblica."""
        try:
            resp = client.get(
                f"{self._catalog_url}/01/{gtin}",
                headers={"Accept": "application/ld+json"},
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
        except Exception:  # noqa: BLE001
            logging.exception("Impossibile leggere la scheda JSON-LD di %s", gtin)
            return None

    def get_product(self, product_id: str) -> Product | None:
        """Retrieve a product by its SKU.

        Args:
            product_id (str): Product ID

        Returns:
            Product | None: Product object if found, None otherwise

        """
        return self._products.get(product_id)

    def _get_line_item(self, product: Product, quantity: int) -> LineItem:
        """Create a line item for a product.

        Args:
            product (Product): Product object
            quantity (int): Quantity of the product

        Returns:
            LineItem: Line item object

        """
        # read product.offers.price, convert to Decimal
        if not product.offers or not product.offers.price:
            raise ValueError(f"Product {product.name} does not have a price.")

        unit_price = int(Decimal(product.offers.price) * 100)

        image_url = None

        if isinstance(product.image, list):
            if isinstance(product.image, str):
                image_url = product.image
            elif isinstance(product.image, list) and product.image:
                first_image = product.image[0]
                if isinstance(first_image, str):
                    image_url = first_image
                elif isinstance(first_image, ImageObject):
                    image_url = first_image.url

        return LineItem(
            id=uuid4().hex,
            item=Item(
                id=product.product_id,
                price=unit_price,
                title=product.name,
                image_url=AnyUrl(image_url) if image_url else None,
            ),
            quantity=quantity,
            totals=[],
        )

    def add_to_checkout(
        self,
        metadata: UcpMetadata,
        product_id: str,
        quantity: int,
        checkout_id: str | None = None,
    ) -> Checkout:
        """Add a product to the checkout.

        Args:
            metadata (UcpMetadata): UCP metadata object
            product_id (str): Product ID of the product to add to checkout
            quantity (int): Quantity of the product to add
            checkout_id (str | None, optional): checkout identifier

        Returns:
            Checkout: checkout object

        """
        product = self.get_product(product_id)
        if not product:
            raise ValueError(f"Product with ID {product_id} is not found")

        if not checkout_id:
            checkout_id = str(uuid4())
            checkout_type = get_checkout_type(metadata)
            checkout = checkout_type(
                id=checkout_id,
                ucp=metadata,
                line_items=[],
                currency=DEFAULT_CURRENCY,
                totals=[],
                status="incomplete",
                links=[],
                payment=PaymentResponse(
                    handlers=self._ucp_metadata["payment"]["handlers"]
                ),
            )
        else:
            checkout = self._checkouts.get(checkout_id)
            if not checkout:
                raise ValueError(f"Checkout with ID {checkout_id} not found")

        found = False
        for line_item in checkout.line_items:
            if line_item.item.id == product_id:
                line_item.quantity += quantity
                found = True
                break
        if not found:
            order_item = self._get_line_item(product, quantity)
            checkout.line_items.append(order_item)

        self._recalculate_checkout(checkout)
        self._checkouts[checkout_id] = checkout

        return checkout

    def get_checkout(self, checkout_id: str) -> Checkout | None:
        """Retrieve a Checkout by its ID.

        Args:
            checkout_id (str): ID of the checkout to retrieve

        Returns:
            Checkout | None: Checkout object if found, None otherwise

        """
        return self._checkouts.get(checkout_id)

    def remove_from_checkout(self, checkout_id: str, product_id: str) -> Checkout:
        """Remove a product from the checkout.

        Args:
            checkout_id (str): ID of the checkout to remove from
            product_id (str): Product ID of the product to remove from checkout

        Returns:
            Checkout: checkout object

        """
        checkout = self.get_checkout(checkout_id)

        if checkout is None:
            raise ValueError(f"Checkout with ID {checkout_id} not found")

        for line_item in checkout.line_items:
            if line_item.item.id == product_id:
                checkout.line_items.remove(line_item)
                break

        self._recalculate_checkout(checkout)
        self._checkouts[checkout_id] = checkout
        return checkout

    def update_checkout(
        self, checkout_id: str, product_id: str, quantity: int
    ) -> Checkout:
        """Update the quantity of a product in the checkout.

        Args:
            checkout_id (str): ID of the checkout to update
            product_id (str): ID of the product to update
            quantity (int): New quantity of the product

        Returns:
            Checkout: checkout object

        """
        checkout = self.get_checkout(checkout_id)

        if checkout is None:
            raise ValueError(f"Checkout with ID {checkout_id} not found")

        for line_item in checkout.line_items:
            if line_item.item.id == product_id:
                line_item.quantity = quantity
                break

        self._recalculate_checkout(checkout)
        self._checkouts[checkout_id] = checkout
        return checkout

    def _recalculate_checkout(self, checkout: Checkout) -> None:
        """Recalculate the checkout totals.

        Args:
            checkout: The checkout object to recalculate.

        """
        # reset the checkout status
        checkout.status = "incomplete"

        items_base_amount = 0
        items_discount = 0

        for line_item in checkout.line_items:
            item = line_item.item
            unit_price = item.price
            base_amount = unit_price * line_item.quantity
            discount = 0
            line_item.totals = [
                Total(
                    type="items_discount",
                    display_text="Items Discount",
                    amount=discount,
                ),
                Total(
                    type="subtotal",
                    display_text="Subtotal",
                    amount=base_amount - discount,
                ),
                Total(
                    type="total",
                    display_text="Total",
                    amount=base_amount - discount,
                ),
            ]

            items_base_amount += base_amount
            items_discount += discount

        subtotal = items_base_amount - items_discount
        discount = 0

        totals = [
            Total(
                type="items_discount",
                display_text="Items Discount",
                amount=items_discount,
            ),
            Total(
                type="subtotal",
                display_text="Subtotal",
                amount=items_base_amount - items_discount,
            ),
            Total(type="discount", display_text="Discount", amount=discount),
        ]

        final_total = subtotal - discount

        if isinstance(checkout, FulfillmentCheckout) and checkout.fulfillment:
            # add taxes and shipping if checkout has fulfillment address
            tax = round(subtotal * 0.1)  # assume 10% flat tax
            selected_fulfillment_option = None

            # Find selected option in the fulfillment structure
            if checkout.fulfillment.root.methods:
                for method in checkout.fulfillment.root.methods:
                    if method.groups:
                        for group in method.groups:
                            if group.selected_option_id:
                                for option in group.options or []:
                                    if option.id == group.selected_option_id:
                                        selected_fulfillment_option = option
                                        break

            if selected_fulfillment_option:
                shipping = 0
                for total in selected_fulfillment_option.totals:
                    if total.type == "total":
                        shipping = total.amount
                        break
                totals.append(
                    Total(
                        type="fulfillment",
                        display_text="Shipping",
                        amount=shipping,
                    )
                )
                totals.append(Total(type="tax", display_text="Tax", amount=tax))
                final_total += shipping + tax

        totals.append(Total(type="total", display_text="Total", amount=final_total))
        checkout.totals = totals
        checkout.continue_url = AnyUrl(f"https://example.com/checkout?id={checkout.id}")

    def add_delivery_address(
        self, checkout_id: str, address: PostalAddress
    ) -> Checkout:
        """Add a delivery address to the checkout.

        Args:
            checkout_id (str): ID of the checkout to update.
            address: The delivery address.

        Returns:
            Checkout: The updated checkout object.

        """
        checkout = self.get_checkout(checkout_id)
        if checkout is None:
            raise ValueError(f"Checkout with ID {checkout_id} not found")

        if isinstance(checkout, FulfillmentCheckout):
            dest_id = f"dest_{uuid4().hex[:8]}"
            destination = FulfillmentDestinationResponse(
                root=ShippingDestinationResponse(id=dest_id, **address.model_dump())
            )

            fulfillment_options = self._get_fulfillment_options()
            selected_option_id = fulfillment_options[0].id

            line_item_ids = [li.item.id for li in checkout.line_items]

            group = FulfillmentGroupResponse(
                id=f"package_{uuid4().hex[:8]}",
                line_item_ids=line_item_ids,
                options=fulfillment_options,
                selected_option_id=selected_option_id,
            )

            method = FulfillmentMethodResponse(
                id=f"method_{uuid4().hex[:8]}",
                type="shipping",
                line_item_ids=line_item_ids,
                destinations=[destination],
                selected_destination_id=dest_id,
                groups=[group],
            )

            checkout.fulfillment = Fulfillment(
                root=FulfillmentResponse(methods=[method])
            )

        self._recalculate_checkout(checkout)
        self._checkouts[checkout_id] = checkout
        return checkout

    def start_payment(self, checkout_id: str) -> Checkout | str:
        """Start the payment process for the checkout.

        Args:
            checkout_id (str): ID of the checkout to start.

        Returns:
            Checkout | str: The updated checkout object or error message.

        """
        checkout = self.get_checkout(checkout_id)
        if checkout is None:
            raise ValueError(f"Checkout with ID {checkout_id} not found")

        if checkout.status == "ready_for_complete":
            return checkout

        messages = []
        if checkout.buyer is None:
            messages.append("Provide a buyer email address")

        if isinstance(checkout, FulfillmentCheckout) and checkout.fulfillment is None:
            messages.append("Provide a fulfillment address")

        if messages:
            return "\n".join(messages)

        self._recalculate_checkout(checkout)
        checkout.status = "ready_for_complete"
        self._checkouts[checkout_id] = checkout
        return checkout

    def place_order(self, checkout_id: str) -> Checkout:
        """Place an order.

        Args:
            checkout_id (str): ID of the checkout to place the order for.

        Returns:
            Checkout: The Checkout object with order confirmation.

        """
        checkout = self.get_checkout(checkout_id)
        if checkout is None:
            raise ValueError(f"Checkout with ID {checkout_id} not found")

        order_id = f"ORD-{checkout_id}"

        checkout.status = "completed"
        checkout.order = OrderConfirmation(
            id=order_id,
            permalink_url=f"https://example.com/order?id={order_id}",
        )

        self._orders[order_id] = checkout
        # Clear the checkout after placing the order
        del self._checkouts[checkout_id]
        return checkout

    def _get_fulfillment_options(self) -> list[FulfillmentOptionResponse]:
        """Return a list of available fulfillment options.

        Returns:
            list[FulfillmentOptionResponse]: Available fulfillment options.

        """
        return [
            FulfillmentOptionResponse(
                id="standard",
                title="Standard Shipping",
                description="Arrives in 4-5 days",
                carrier="USPS",
                totals=[
                    Total(type="subtotal", display_text="Subtotal", amount=500),
                    Total(type="tax", display_text="Tax", amount=0),
                    Total(type="total", display_text="Total", amount=500),
                ],
            ),
            FulfillmentOptionResponse(
                id="express",
                title="Express Shipping",
                description="Arrives in 1-2 days",
                carrier="FedEx",
                totals=[
                    Total(
                        type="subtotal",
                        display_text="Subtotal",
                        amount=1000,
                    ),
                    Total(type="tax", display_text="Tax", amount=0),
                    Total(type="total", display_text="Total", amount=1000),
                ],
            ),
        ]
