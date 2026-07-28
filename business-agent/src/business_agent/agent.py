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

import logging
import os
from typing import Any
import httpx
from a2a.types import TaskState
from a2a.utils import get_message_text
from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types
from ucp_sdk.models.schemas.shopping.types.buyer import Buyer
from ucp_sdk.models.schemas.shopping.types.postal_address import PostalAddress
from .a2a_extensions import UcpExtension
from .constants import (
    ADK_EXTENSIONS_STATE_KEY,
    ADK_LATEST_TOOL_RESULT,
    ADK_PAYMENT_STATE,
    ADK_UCP_METADATA_STATE,
    ADK_USER_CHECKOUT_ID,
    UCP_CHECKOUT_KEY,
    UCP_PAYMENT_DATA_KEY,
    UCP_RISK_SIGNALS_KEY,
)
from .payment_processor import MockPaymentProcessor
from .store import RetailStore


store = RetailStore()
mpp = MockPaymentProcessor()

CATALOG_URL = os.getenv("CATALOG_URL", "http://localhost:8080")


def _create_error_response(message: str) -> dict:
    return {"message": message, "status": "error"}


def leggi_prodotto(tool_context: ToolContext, gtin: str) -> dict:
    """Read the full GS1 product sheet (JSON-LD) for a product by its GTIN.

    Use this AFTER search_shopping_catalog to obtain the detailed, certified
    GS1 Italy data for a product: ingredients (gs1:ingredient /
    gs1:ingredientStatement), allergens (gs1:allergenRelatedInformation with
    levelOfContainmentCode CONTAINS / FREE_FROM / MAY_CONTAIN), nutritional
    values (gs1:*PerNutrientBasis, referred to gs1:nutrientBasisQuantity),
    dimensions/weights, brand owner and the commercial offer (offers.price).
    Answer allergen and nutrition questions ONLY from this data and cite the
    source as "GS1 Italy".

    Args:
        tool_context: The tool context for the current request.
        gtin: The product GTIN, e.g. "08032089000147".

    Returns:
        dict: The full product JSON-LD, or an error response.

    """
    try:
        resp = httpx.get(
            f"{CATALOG_URL}/01/{gtin}",
            headers={"Accept": "application/ld+json"},
            timeout=5.0,
        )
        resp.raise_for_status()
        return {"product_jsonld": resp.json(), "status": "success"}
    except Exception:
        logging.exception("Error reading the product sheet for %s", gtin)
        return _create_error_response(
            f"Could not read the product sheet for GTIN {gtin}."
        )


def search_shopping_catalog(tool_context: ToolContext, query: str) -> dict:
    """Search the product catalog for products that match the given query.

    Args:
        tool_context: The tool context for the current request.
        query: Query for performing product search.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    try:
        product_results = store.search_products(query)
        return {"a2a.product_results": product_results.model_dump(mode="json")}
    except Exception:
        logging.exception("There was an error searching the product catalog.")
        return _create_error_response(
            "Sorry, there was an error searching the product catalog, "
            "please try again later."
        )


def add_to_checkout(
    tool_context: ToolContext, product_id: str, quantity: int = 1
) -> dict:
    """Add a product to the checkout session.

    Args:
        tool_context: The tool context for the current request.
        product_id: Product ID or SKU.
        quantity: Quantity; defaults to 1 if not specified.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = tool_context.state.get(ADK_USER_CHECKOUT_ID)
    ucp_metadata = tool_context.state.get(ADK_UCP_METADATA_STATE)

    if not ucp_metadata:
        return _create_error_response("There was an error creating UCP metadata")

    try:
        checkout = store.add_to_checkout(
            ucp_metadata, product_id, quantity, checkout_id
        )
        if not checkout_id:
            tool_context.state[ADK_USER_CHECKOUT_ID] = checkout.id

        return {
            UCP_CHECKOUT_KEY: checkout.model_dump(mode="json"),
            "status": "success",
        }
    except ValueError:
        logging.exception(
            "There was an error adding item to checkout, please retry later."
        )
        return _create_error_response(
            "There was an error adding item to checkout, please retry later."
        )


def remove_from_checkout(tool_context: ToolContext, product_id: str) -> dict:
    """Remove a product from the checkout session.

    Args:
        tool_context: The tool context for the current request.
        product_id: Product ID or SKU.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = _get_current_checkout_id(tool_context)

    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    try:
        return {
            UCP_CHECKOUT_KEY: (
                store.remove_from_checkout(checkout_id, product_id).model_dump(
                    mode="json"
                )
            ),
            "status": "success",
        }
    except ValueError:
        logging.exception(
            "There was an error removing item from checkout, please retry later."
        )
        return _create_error_response(
            "There was an error removing item from checkout, please retry later."
        )


def update_checkout(tool_context: ToolContext, product_id: str, quantity: int) -> dict:
    """Update the quantity of a product in the checkout session.

    Args:
        tool_context: The tool context for the current request.
        product_id: Product ID or SKU.
        quantity: New quantity for the product.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = _get_current_checkout_id(tool_context)
    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    try:
        return {
            UCP_CHECKOUT_KEY: (
                store.update_checkout(checkout_id, product_id, quantity).model_dump(
                    mode="json"
                )
            ),
            "status": "success",
        }
    except ValueError:
        logging.exception(
            "There was an error updating item in the cart, please retry later."
        )
        return _create_error_response(
            "There was an error updating item in the cart, please retry later."
        )


def get_checkout(tool_context: ToolContext) -> dict:
    """Retrieve a Checkout Session.

    Args:
        tool_context: The tool context for the current request.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = _get_current_checkout_id(tool_context)

    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    checkout = store.get_checkout(checkout_id)
    if checkout is None:
        return _create_error_response("Checkout not found with the given ID.")

    return {
        UCP_CHECKOUT_KEY: checkout.model_dump(mode="json"),
        "status": "success",
    }


def update_customer_details(
    tool_context: ToolContext,
    first_name: str,
    last_name: str,
    street_address: str,
    address_locality: str,
    address_region: str,
    postal_code: str,
    address_country: str | None,
    extended_address: str | None = None,
    email: str | None = None,
) -> dict:
    """Add delivery address to the checkout.

    Args:
        tool_context: The tool context for the current request.
        first_name: First name of the recipient.
        last_name: Last name of the recipient.
        street_address: The street address. For example, 1600 Amphitheatre Pkwy.
        address_locality: The locality in which the street address is.
        address_region: The region in which the locality is.
        postal_code: The postal code. For example, 94043.
        address_country: The country.
        extended_address: The extended address of the postal address.
        email: The email address of the recipient.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = _get_current_checkout_id(tool_context)

    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    if not address_country:
        address_country = "US"

    address = PostalAddress(
        street_address=street_address,
        extended_address=extended_address,
        address_locality=address_locality,
        address_region=address_region,
        address_country=address_country,
        postal_code=postal_code,
        first_name=first_name,
        last_name=last_name,
    )

    checkout = store.add_delivery_address(checkout_id, address)

    if email:
        checkout.buyer = Buyer(email=email)

    # invoke start payment tool once the user details are added
    return start_payment(tool_context)


async def complete_checkout(tool_context: ToolContext) -> dict:
    """Process the payment data to complete checkout.

    Args:
        tool_context: The tool context for the current request.

    Returns:
        dict: Returns the response from the tool with success or error status.

    """
    checkout_id = _get_current_checkout_id(tool_context)

    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    checkout = store.get_checkout(checkout_id)

    if checkout is None:
        return _create_error_response("Checkout not found for the current session.")

    payment_data: dict[str, Any] = tool_context.state.get(ADK_PAYMENT_STATE)

    if payment_data is None:
        return {
            "message": (
                "Payment Data is missing. Click 'Confirm Purchase' "
                "to complete the purchase."
            ),
            "status": "requires_more_info",
        }

    try:
        task = mpp.process_payment(
            payment_data[UCP_PAYMENT_DATA_KEY],
            payment_data[UCP_RISK_SIGNALS_KEY],
        )

        if task is None:
            return _create_error_response("Failed to receive a valid response from MPP")

        if task.status is not None and task.status.state == TaskState.completed:
            payment_instrument = payment_data.get(UCP_PAYMENT_DATA_KEY)
            checkout.payment.selected_instrument_id = payment_instrument.root.id
            checkout.payment.instruments = [payment_instrument]

            response = store.place_order(checkout_id)
            # clear completed checkout from state
            tool_context.state[ADK_USER_CHECKOUT_ID] = None
            return {
                UCP_CHECKOUT_KEY: response.model_dump(mode="json"),
                "status": "success",
            }
        else:
            return _create_error_response(
                get_message_text(task.status.message)  # type: ignore
            )
    except Exception:
        logging.exception("There was an error completing the checkout.")
        return _create_error_response(
            "Sorry, there was an error completing the checkout, please try again."
        )


def start_payment(tool_context: ToolContext) -> dict:
    """Ask for required information to proceed with the payment.

    Args:
        tool_context: The tool context for the current request.

    Returns:
        dict: checkout object

    """
    checkout_id = _get_current_checkout_id(tool_context)

    if not checkout_id:
        return _create_error_response("A Checkout has not yet been created.")

    result = store.start_payment(checkout_id)
    if isinstance(result, str):
        return {"message": result, "status": "requires_more_info"}
    else:
        tool_context.actions.skip_summarization = True
        return {
            UCP_CHECKOUT_KEY: result.model_dump(mode="json"),
            "status": "success",
        }


def _get_current_checkout_id(tool_context: ToolContext) -> str | None:
    """Return the current checkout ID from the tool context state.

    Args:
        tool_context: The tool context for the current request.

    Returns:
        str | None: The checkout ID if present, else None.

    """
    return tool_context.state.get(ADK_USER_CHECKOUT_ID)


def after_tool_modifier(
    tool: BaseTool,
    args: dict[str, Any],
    tool_context: ToolContext,
    tool_response: dict,
) -> dict | None:
    """Modify the tool response before returning to the agent.

    Args:
        tool: The tool that was executed.
        args: The arguments passed to the tool.
        tool_context: The tool context for the current request.
        tool_response: The response returned by the tool.

    Returns:
        dict | None: The modified tool response, or None.

    """
    extensions = tool_context.state.get(ADK_EXTENSIONS_STATE_KEY, [])
    # add typed data responses to the state
    ucp_response_keys = [UCP_CHECKOUT_KEY, "a2a.product_results"]
    if UcpExtension.URI in extensions and any(
        key in tool_response for key in ucp_response_keys
    ):
        tool_context.state[ADK_LATEST_TOOL_RESULT] = tool_response

    return None


def modify_output_after_agent(
    callback_context: CallbackContext,
) -> types.Content | None:
    """Modify the agent's output before returning to the user.

    Args:
        callback_context: The callback context for the agent run.

    Returns:
        types.Content | None: The modified agent output, or None.

    """
    # add the UCP tool responses as agent output
    latest_result = callback_context.state.get(ADK_LATEST_TOOL_RESULT)
    if latest_result:
        return types.Content(
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        response={"result": latest_result}
                    )
                )
            ],
            role="model",
        )

    return None


root_agent = Agent(
    name="shopper_agent",
    model=os.getenv("GEMINI_MODEL", "gemini-3-flash-preview"),
    description="Agent to help with shopping",
    instruction=(
        "You are a helpful agent who can help user with shopping actions such"
        " as searching the catalog, add to checkout session, complete checkout"
        " and handle order placed event.Given the user ask, plan ahead and"
        " invoke the tools available to complete the user's ask. Always make"
        " sure you have completed all aspects of the user's ask. If the user"
        " says add to my list or remove from the list, add or remove from the"
        " cart, add the product or remove the product from the checkout"
        " session. If the user asks to add any items to the checkout session,"
        " search for the products and then add the matching products to"
        " checkout session.If the user asks to replace products,"
        " use remove_from_checkout and add_to_checkout tools to replace the"
        " products to match the user request."
        " The catalog is backed by GS1 Italy certified product data and spans six"
        " sectors: consumer goods, fresh foods, foodservice, apparel, healthcare"
        " and construction. When the user asks about any product detail — for"
        " food: ingredients, allergens (e.g. gluten, milk, nuts), nutritional"
        " values (calories, protein, sugars, salt); for apparel: textile"
        " materials, colour, size, care instructions; for any product: weight,"
        " dimensions, packaging, country of origin, certifications,"
        " sustainability or traceability — first search the catalog to find the"
        " product's GTIN, then call leggi_prodotto(gtin) to read its full GS1"
        " JSON-LD sheet, and answer strictly from that data. Relevant properties"
        " include gs1:ingredientStatement, gs1:allergen / gs1:allergenStatement,"
        " gs1:*PerNutrientBasis, gs1:textileMaterial, gs1:netContent,"
        " gs1:countryOfOrigin and gs1:packaging. For allergens rely on the"
        " gs1:allergen data (levelOfContainmentCode: CONTAINS / FREE_FROM /"
        " MAY_CONTAIN) and never guess. Nutritional values are expressed per"
        " gs1:nutrientBasisQuantity (e.g. per 100 g or 100 ml): always state the"
        " reference basis. When you use GS1 data, cite the source as 'GS1 Italy'."
        " Decimal values may use a comma as separator."
        "\n\nNOT ALL PRODUCTS PUBLISH GS1 DATA. Some products in this catalog"
        " deliberately have no structured data sheet: for them leggi_prodotto"
        " fails or returns an error. That is not a bug and not a reason to retry"
        " endlessly — say plainly that this product does not publish structured"
        " GS1 data, so its details cannot be verified, and point out that other"
        " products in the catalog do. Never fill the gap with general knowledge."
        "\n\nGROUNDING (strict): Answer ONLY using information returned by your"
        " tools — the catalog from search_shopping_catalog and the product-sheet"
        " JSON-LD from leggi_prodotto. Do NOT invent, guess, estimate or rely on"
        " prior/general knowledge for any product fact: names, prices, brands,"
        " GTIN, ingredients, allergens, nutritional values, weights, dimensions,"
        " origin or availability must come verbatim from the product pages. If a"
        " requested detail is not present in the data you have read, say clearly"
        " that the information is not available in the product sheet (and, if"
        " useful, call leggi_prodotto for that product first) instead of making"
        " it up. Never state an allergen or 'gluten-free'/'contains' claim that"
        " is not explicitly in gs1:allergenRelatedInformation. If no product"
        " matches the user's request, say so rather than inventing a product."
        "\n\nAlways reply in the user's language; the catalog and the store are"
        " Italian, so default to Italian."
    ),
    tools=[
        search_shopping_catalog,
        leggi_prodotto,
        add_to_checkout,
        remove_from_checkout,
        update_checkout,
        get_checkout,
        start_payment,
        update_customer_details,
        complete_checkout,
    ],
    after_tool_callback=after_tool_modifier,
    after_agent_callback=modify_output_after_agent,
)
