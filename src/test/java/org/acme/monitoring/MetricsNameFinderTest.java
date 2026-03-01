package org.acme.monitoring;

import io.micrometer.core.instrument.MeterRegistry;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;

@QuarkusTest
public class MetricsNameFinderTest {

    @Inject
    MeterRegistry registry;

    @Test
    public void testMetrics() throws Exception {
        // Trigger some request to register metrics, ignore the status (can be 500)
        given()
                .when().get("/computer/pagination?limit=1");

        // Request again to simulate /ssr metrics
        given()
                .when().get("/ssr");

        // Print all meters
        System.out.println("====== METRIC NAMES ======");
        registry.getMeters().forEach(m -> {
            System.out.println(m.getId().getName() + " tags: " + m.getId().getTags());
        });
        System.out.println("==========================");
    }
}
