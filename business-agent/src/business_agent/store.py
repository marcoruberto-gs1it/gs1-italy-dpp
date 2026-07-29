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
