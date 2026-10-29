export const PAYMENT_CONTRACT = {
  "id": "urn:amastan:payments:normalized:v1",
  "version": "1.0.0",
  "standard": "v3.2.0",
  "minRows": 1,
  "maxRows": 5000,
  "maxCsvBytes": 2000000,
  "requiredColumns": [
    "transaction_id",
    "user_id",
    "recipient_id",
    "amount_tnd",
    "timestamp",
    "governorate",
    "payment_method"
  ],
  "governorates": [
    "Tunis",
    "Ariana",
    "Ben Arous",
    "Manouba",
    "Bizerte",
    "Nabeul",
    "Zaghouan",
    "Béja",
    "Jendouba",
    "Le Kef",
    "Siliana",
    "Sousse",
    "Monastir",
    "Mahdia",
    "Kairouan",
    "Kasserine",
    "Sidi Bouzid",
    "Sfax",
    "Gafsa",
    "Tozeur",
    "Kébili",
    "Gabès",
    "Médenine",
    "Tataouine"
  ],
  "paymentMethods": [
    "card",
    "flouci",
    "d17",
    "edinar",
    "konnect",
    "bank_transfer"
  ],
  "identifier": {
    "minLength": 1,
    "maxLength": 80,
    "pattern": "^[^\\x00-\\x1f\\x7f]*$"
  },
  "amount": {
    "minimum": 0.001,
    "maximum": 100000000,
    "decimalPlaces": 3
  },
  "timestampInputPattern": "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$"
};
