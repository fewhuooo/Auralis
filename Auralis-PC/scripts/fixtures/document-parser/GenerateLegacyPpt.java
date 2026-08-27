import java.awt.Rectangle;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.poi.hslf.usermodel.HSLFSlide;
import org.apache.poi.hslf.usermodel.HSLFSlideShow;
import org.apache.poi.hslf.usermodel.HSLFTextBox;

/**
 * Generates a small, genuine binary PowerPoint 97-2003 (.ppt) fixture.
 *
 * The source is intentionally kept beside the fixture manifest so the binary
 * can be regenerated without renaming a .pptx or relying on Microsoft Office.
 */
public final class GenerateLegacyPpt {
    private GenerateLegacyPpt() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("usage: GenerateLegacyPpt <output.ppt>");
        }

        Path output = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(output.getParent());

        try (HSLFSlideShow slideshow = new HSLFSlideShow();
             FileOutputStream stream = new FileOutputStream(output.toFile())) {
            HSLFSlide slide = slideshow.createSlide();

            HSLFTextBox title = slide.createTextBox();
            title.setAnchor(new Rectangle(48, 36, 620, 60));
            title.setText("Auralis legacy PPT fixture");

            HSLFTextBox body = slide.createTextBox();
            body.setAnchor(new Rectangle(72, 128, 560, 220));
            body.setText("这是一个用于 Office 解析回归的真实 PowerPoint 97-2003 文件。\n"
                    + "The parser must keep this slide text ordered.\n"
                    + "Fixture purpose: extract, bitmap fallback, or OFFICE_TEXT_UNAVAILABLE.");

            slideshow.write(stream);
        }
    }
}
