package mesadeduelo.bridge;
import static org.junit.Assert.*;
import com.google.gson.*;
import org.junit.Test;
public class AmountAllocationTest {
    private final JsonObject question = JsonParser.parseString("{\"total\":5,\"options\":[{\"min\":1,\"max\":4},{\"min\":1,\"max\":4}]}").getAsJsonObject();
    @Test public void preservesAnExplicitLegalDivision() { assertArrayEquals(new int[]{2,3},AmountAllocation.validate(question,JsonParser.parseString("[2,3]"))); }
    @Test public void rejectsBadShapeBoundsFractionsAndTotals() {
        for(String input:new String[]{"[5]","[0,5]","[-1,6]","[1.5,3.5]","[1,1]","[4,4]","[\"2\",3]","[2147483648,0]"}) {
            try { AmountAllocation.validate(question,JsonParser.parseString(input)); fail(input); } catch(IllegalArgumentException expected) { }
        }
    }
}
