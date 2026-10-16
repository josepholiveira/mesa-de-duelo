package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Validates an explicit user allocation; it never guesses how to divide an effect. */
final class AmountAllocation {
    static int[] validate(JsonObject question, JsonElement answer) {
        JsonArray options = question.getAsJsonArray("options");
        if (answer == null || !answer.isJsonArray() || answer.getAsJsonArray().size() != options.size())
            throw new IllegalArgumentException("Informe uma quantidade para cada opção.");
        int[] amounts = new int[options.size()]; long sum = 0;
        for (int i = 0; i < amounts.length; i++) {
            JsonElement e = answer.getAsJsonArray().get(i);
            try {
                if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) throw new ArithmeticException();
                amounts[i] = e.getAsBigDecimal().intValueExact();
            } catch (RuntimeException ex) { throw new IllegalArgumentException("Use somente quantidades inteiras."); }
            JsonObject option = options.get(i).getAsJsonObject();
            if (amounts[i] < option.get("min").getAsInt() || amounts[i] > option.get("max").getAsInt())
                throw new IllegalArgumentException("Respeite os limites de cada opção.");
            sum += amounts[i];
        }
        if (sum != question.get("total").getAsInt()) throw new IllegalArgumentException("Distribua exatamente a quantidade indicada.");
        return amounts;
    }
    private AmountAllocation() { }
}
